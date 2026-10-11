'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { releaseContext, remoteTag, existingRelease, sourceStamp, prepareTag, publishArtifacts, main } = require('../ci-draft-release.cjs');

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const env = { GITHUB_SHA: sha, GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '123', GITHUB_REF_TYPE: 'branch' };
const context = releaseContext({ version: '2026.9.23' }, env);
const ref = { ref: `refs/tags/${context.tag}`, object: { type: 'commit', sha } };
const draft = { tag_name: context.tag, draft: true, target_commitish: 'main', body: `${sourceStamp(context)}\n\nUnsigned fixture.` };

function response(status, value) {
  return { status: status >= 400 ? 1 : 0, signal: null,
    stdout: `HTTP/2.0 ${status} Fixture\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(value)}`, stderr: '' };
}

function stub(options = {}) {
  const calls = [];
  const gh = args => {
    calls.push(args);
    if (options.override) {
      const overridden = options.override(args);
      if (overridden !== undefined) return overridden;
    }
    if (args[0] !== 'api') return { status: options.releaseExit || 0, signal: null, stdout: '', stderr: 'fixture release result' };
    const method = args[args.indexOf('--method') + 1];
    const endpoint = args[4];
    if (method === 'GET' && endpoint.includes('/git/ref/')) return response(options.refStatus || (options.ref === null ? 404 : 200), options.ref ?? ref);
    if (method === 'GET' && endpoint.includes('/git/tags/')) {
      const objectSha = endpoint.split('/').at(-1);
      assert.ok(options.tagObjects?.[objectSha], `unexpected tag object lookup: ${endpoint}`);
      return response(200, options.tagObjects[objectSha]);
    }
    if (method === 'GET' && endpoint.includes('/releases?')) return response(options.listStatus || 200, options.releases || []);
    if (method === 'POST' && endpoint.endsWith('/git/refs')) return response(options.createStatus || 201, options.created || ref);
    throw new Error(`unexpected fake gh call: ${JSON.stringify(args)}`);
  };
  return { gh, calls };
}

const writes = calls => calls.filter(args => args[0] === 'release' || args.includes('POST'));

test('release tag rules match dispatch, custom tag, and tag-push sources; unsafe arguments fail', () => {
  assert.equal(context.tag, 'v2026.9.23-ci.123');
  assert.equal(releaseContext({ version: '2026.9.23' }, { ...env, CI_RELEASE_TAG: 'v2026.9.23-custom' }).tag, 'v2026.9.23-custom');
  assert.equal(releaseContext({ version: '2026.9.23' }, { ...env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v2026.9.23-pushed', CI_RELEASE_TAG: 'v1-ignored' }).tag, 'v2026.9.23-pushed');
  for (const changes of [{ GITHUB_SHA: 'main' }, { GITHUB_REPOSITORY: 'owner/repo\n--hostname=bad' }, { CI_RELEASE_TAG: 'v1;touch file' }]) {
    assert.throws(() => releaseContext({ version: '2026.9.23' }, { ...env, ...changes }));
  }
});

test('prepare reuses an exact existing tag and discovers a matching draft without mutation', () => {
  const { gh, calls } = stub({ releases: [draft] });
  assert.equal(prepareTag(context, gh).sourceCommit, sha);
  assert.equal(writes(calls).length, 0);
});

test('prepare peels nested annotated tag objects to the exact source commit', () => {
  const first = 'c'.repeat(40), second = 'd'.repeat(40);
  const { gh, calls } = stub({ ref: { ...ref, object: { type: 'tag', sha: first } }, tagObjects: {
    [first]: { sha: first, object: { type: 'tag', sha: second } },
    [second]: { sha: second, object: { type: 'commit', sha } },
  } });
  assert.equal(prepareTag(context, gh).sourceCommit, sha);
  assert.equal(calls.filter(args => args[4]?.includes('/git/tags/')).length, 2);
  assert.equal(writes(calls).length, 0);
});

test('annotated cycles and chains beyond eight objects fail closed', () => {
  const first = 'c'.repeat(40);
  const cycle = stub({ ref: { ...ref, object: { type: 'tag', sha: first } }, tagObjects: {
    [first]: { sha: first, object: { type: 'tag', sha: first } },
  } });
  assert.throws(() => prepareTag(context, cycle.gh), /eight tag objects/);
  const objects = Object.fromEntries(Array.from({ length: 9 }, (_, index) => {
    const current = (index + 1).toString(16).repeat(40);
    return [current, { sha: current, object: { type: 'tag', sha: (index + 2).toString(16).repeat(40) } }];
  }));
  const chain = stub({ ref: { ...ref, object: { type: 'tag', sha: '1'.repeat(40) } }, tagObjects: objects });
  assert.throws(() => prepareTag(context, chain.gh), /eight tag objects/);
  assert.equal(writes(chain.calls).length, 0);
});

test('wrong source, wrong reference, and noncommit tag objects refuse preparation', () => {
  for (const bad of [{ ...ref, object: { type: 'commit', sha: otherSha } },
    { ...ref, ref: 'refs/tags/v1-other' }, { ...ref, object: { type: 'blob', sha } }]) {
    const { gh, calls } = stub({ ref: bad });
    assert.throws(() => prepareTag(context, gh));
    assert.equal(writes(calls).length, 0);
  }
});

test('only an explicit tag-ref HTTP 404 creates the exact lightweight tag', () => {
  const { gh, calls } = stub({ ref: null });
  assert.equal(prepareTag(context, gh).sourceCommit, sha);
  assert.deepEqual(writes(calls), [['api', '--include', '--method', 'POST', 'repos/owner/repo/git/refs',
    '-f', `ref=refs/tags/${context.tag}`, '-f', `sha=${sha}`]]);
});

test('untagged exact-source draft can prepare; a different hint cannot gain authority from a new tag', () => {
  const valid = stub({ ref: null, releases: [{ ...draft, target_commitish: sha }] });
  prepareTag(context, valid.gh);
  assert.equal(writes(valid.calls).length, 1);
  const invalid = stub({ ref: null, releases: [draft] });
  assert.throws(() => prepareTag(context, invalid.gh), /another commit/);
  assert.equal(writes(invalid.calls).length, 0);
});

test('published releases refuse both preparation and publication', () => {
  for (const tag of [ref, null]) {
    const fixture = stub({ ref: tag, releases: [{ ...draft, draft: false, target_commitish: sha }] });
    assert.throws(() => prepareTag(context, fixture.gh), /published release/);
    assert.equal(writes(fixture.calls).length, 0);
  }
  const fixture = stub({ releases: [{ ...draft, draft: false }] });
  assert.throws(() => publishArtifacts(context, ['fixture.exe'], 'notes.md', fixture.gh), /published release/);
  assert.equal(writes(fixture.calls).length, 0);
});

test('API 403/500, absent HTTP status, and process errors never become not-found creation', () => {
  for (const options of [{ refStatus: 403 }, { refStatus: 500 },
    { override: () => ({ status: 1, stdout: '', stderr: 'HTTP 404: network failed' }) },
    { override: () => ({ status: null, error: new Error('timed out') }) }]) {
    const fixture = stub(options);
    assert.throws(() => prepareTag(context, fixture.gh));
    assert.equal(writes(fixture.calls).length, 0);
  }
});

test('tag creation API errors and wrong created reference are fatal', () => {
  for (const options of [{ createStatus: 403 }, { created: { ...ref, object: { type: 'commit', sha: otherSha } } }]) {
    const fixture = stub({ ref: null, ...options });
    assert.throws(() => prepareTag(context, fixture.gh));
    assert.equal(writes(fixture.calls).length, 1);
    assert.equal(fixture.calls.some(args => args[0] === 'release'), false);
  }
});

test('draft discovery paginates and refuses duplicate tags, API errors, or a full page limit', () => {
  const page = Array.from({ length: 100 }, (_, index) => ({ tag_name: `other-${index}` }));
  const paginated = stub({ override: args => /[?&]page=1$/.test(args[4] || '') ? response(200, page) : undefined, releases: [draft] });
  assert.equal(existingRelease(context, paginated.gh).tag_name, context.tag);
  assert.equal(paginated.calls.length, 2);
  for (const options of [{ releases: [draft, draft] }, { listStatus: 500 }, { releases: page }]) {
    const fixture = stub({ ref: null, ...options });
    assert.throws(() => prepareTag(context, fixture.gh));
    assert.equal(writes(fixture.calls).length, 0);
  }
});

test('main hint plus exact tag and unique exact source stamp allows upload and notes edit', () => {
  const { gh, calls } = stub({ releases: [draft] });
  publishArtifacts(context, ['fixture file.exe'], 'notes.md', gh);
  assert.deepEqual(writes(calls).map(args => args.slice(0, 3)), [
    ['release', 'upload', context.tag], ['release', 'edit', context.tag],
  ]);
});

test('main hint cannot reuse a wrong tag, a wrong body source, or duplicate source stamps', () => {
  for (const options of [{ ref: { ...ref, object: { type: 'commit', sha: otherSha } }, releases: [draft] },
    { releases: [{ ...draft, body: draft.body.replace(sha, otherSha) }] },
    { releases: [{ ...draft, body: `${sourceStamp(context)}\n${sourceStamp(context)}` }] },
    { releases: [{ ...draft, body: `${sourceStamp(context)}\nUnsigned LobsterAI 2026.9.22 build from commit ${otherSha}.` }] }]) {
    const fixture = stub(options);
    assert.throws(() => publishArtifacts(context, ['fixture.exe'], 'notes.md', fixture.gh));
    assert.equal(writes(fixture.calls).length, 0);
  }
});

test('an existing draft with an exact source hint retains the previous strict-source compatibility', () => {
  const fixture = stub({ releases: [{ ...draft, target_commitish: sha, body: null }] });
  publishArtifacts(context, ['fixture.exe'], 'notes.md', fixture.gh);
  assert.equal(writes(fixture.calls).length, 2);
});

test('publication requires preparation and creates using the verified tag without a historical target hint', () => {
  const missing = stub({ ref: null });
  assert.throws(() => publishArtifacts(context, ['fixture.exe'], 'notes.md', missing.gh), /prepare-tag/);
  assert.equal(writes(missing.calls).length, 0);
  const valid = stub();
  publishArtifacts(context, ['fixture file.exe'], 'notes.md', valid.gh);
  const [create] = writes(valid.calls);
  assert.equal(create[1], 'create');
  assert.ok(create.includes('--verify-tag'));
  assert.ok(create.includes('--draft'));
  assert.ok(!create.includes('--target'));
  assert.ok(create.includes('fixture file.exe'));
});

test('a failed release upload stops before editing notes', () => {
  const fixture = stub({ releases: [draft], releaseExit: 1 });
  assert.throws(() => publishArtifacts(context, ['fixture.exe'], 'notes.md', fixture.gh), /gh release failed/);
  assert.equal(writes(fixture.calls).length, 1);
});

test('prepare-tag entry runs before selecting targets or producing artifacts', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-prepare-tag-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: context.version }));
  const fixture = stub({ ref: null });
  await main({ directory, env, args: ['--prepare-tag'], gh: fixture.gh });
  assert.equal(writes(fixture.calls).length, 1);
  assert.equal(fixture.calls.some(args => args[0] === 'release'), false);
});

function artifactFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-draft-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: context.version }));
  const target = 'win-x64', metadataName = `build-metadata-${target}.json`, sumsName = `SHA256SUMS-${target}.txt`;
  const artifactDirectory = path.join(directory, 'artifacts', `lobsterai-${target}`);
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const binary = 'LobsterAI fixture.exe', blockmap = `${binary}.blockmap`;
  fs.writeFileSync(path.join(artifactDirectory, binary), 'binary fixture');
  fs.writeFileSync(path.join(artifactDirectory, blockmap), 'blockmap fixture');
  const digest = name => createHash('sha256').update(fs.readFileSync(path.join(artifactDirectory, name))).digest('hex');
  const metadata = { target, sourceCommit: sha, version: context.version,
    artifacts: [binary, blockmap].map(filename => ({ filename, size: fs.statSync(path.join(artifactDirectory, filename)).size, sha256: digest(filename) })) };
  const write = () => {
    fs.writeFileSync(path.join(artifactDirectory, metadataName), `${JSON.stringify(metadata)}\n`);
    fs.writeFileSync(path.join(artifactDirectory, sumsName), [metadataName, ...metadata.artifacts.map(item => item.filename)].map(name => `${digest(name)}  ${name}`).join('\n') + '\n');
  };
  write();
  const fake = stub();
  return { metadata, binary, blockmap, metadataName, sumsName, artifactDirectory, digest, write, ...fake,
    run: () => main({ directory, env: { ...env, CI_BUILD_TARGETS: JSON.stringify([target]) }, args: [], gh: fake.gh }) };
}

test('complete real-file metadata and checksum gate permits a verified-tag draft creation', async t => {
  const fixture = artifactFixture(t);
  await fixture.run();
  assert.equal(writes(fixture.calls)[0][1], 'create');
});

const corruptions = [
  ['missing installer checksum', f => fs.writeFileSync(path.join(f.artifactDirectory, f.sumsName), fs.readFileSync(path.join(f.artifactDirectory, f.sumsName), 'utf8').split('\n').filter(line => !line.endsWith(`  ${f.binary}`)).join('\n')), /Missing artifact checksum/],
  ['missing metadata checksum', f => fs.writeFileSync(path.join(f.artifactDirectory, f.sumsName), fs.readFileSync(path.join(f.artifactDirectory, f.sumsName), 'utf8').split('\n').filter(line => !line.endsWith(`  ${f.metadataName}`)).join('\n')), /Missing artifact checksum/],
  ['duplicate checksum', f => fs.appendFileSync(path.join(f.artifactDirectory, f.sumsName), `${f.digest(f.binary)}  ${f.binary}\n`), /duplicate artifact checksum/],
  ['extra checksum', f => fs.appendFileSync(path.join(f.artifactDirectory, f.sumsName), `${'0'.repeat(64)}  unexpected.exe\n`), /unexpected.*checksum/],
  ['wrong checksum hash', f => fs.writeFileSync(path.join(f.artifactDirectory, f.sumsName), fs.readFileSync(path.join(f.artifactDirectory, f.sumsName), 'utf8').replace(f.digest(f.binary), '0'.repeat(64))), /artifact checksum/],
  ['wrong manifest hash', f => { f.metadata.artifacts[0].sha256 = '0'.repeat(64); f.write(); }, /Artifact hash differs/],
  ['wrong manifest size', f => { f.metadata.artifacts[0].size++; f.write(); }, /Artifact size differs/],
  ['same-size installer tampering', f => fs.writeFileSync(path.join(f.artifactDirectory, f.binary), 'Binary fixture'), /Artifact hash differs/],
  ['duplicate manifest name', f => { f.metadata.artifacts.push({ ...f.metadata.artifacts[0] }); f.write(); }, /duplicate manifest filename/],
  ['missing installer format', f => { f.metadata.artifacts = f.metadata.artifacts.filter(item => item.filename !== f.binary); f.write(); }, /Missing win-x64 .exe/],
];
for (const [name, corrupt, expected] of corruptions) {
  test(`artifact gate refuses ${name} before any GitHub API call`, async t => {
    const fixture = artifactFixture(t);
    corrupt(fixture);
    await assert.rejects(fixture.run(), expected);
    assert.equal(fixture.calls.length, 0);
  });
}
