import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import React, { useState } from 'react';

import { i18nService } from '../../services/i18n';
import type { CoworkUserMemoryEntry } from '../../types/cowork';
import Modal from '../common/Modal';
import EditIcon from '../icons/EditIcon';
import SettingsNavigationIcon from './SettingsNavigationIcon';

interface Props {
  entries: CoworkUserMemoryEntry[];
  total: number;
  query: string;
  loading: boolean;
  expandedIds: Set<string>;
  onQueryChange: (value: string) => void;
  onAdd: () => void;
  onEdit: (entry: CoworkUserMemoryEntry) => void;
  onDelete: (entry: CoworkUserMemoryEntry) => void;
  onExpand: (id: string) => void;
  onEditRaw: () => void;
}

export default function MemoryEntriesSettings(props: Props) {
  const [pendingDelete, setPendingDelete] = useState<CoworkUserMemoryEntry | null>(null);
  const groups: { section?: string; entries: CoworkUserMemoryEntry[] }[] = [];
  for (const entry of props.entries) {
    const last = groups[groups.length - 1];
    if (last && (last.section ?? '') === (entry.section ?? '')) last.entries.push(entry);
    else groups.push({ section: entry.section, entries: [entry] });
  }
  return (
    <section className="settings-memory-entries" aria-label={i18nService.t('coworkMemoryTabEntries')}>
      <div className="settings-memory-toolbar">
        <span className="settings-count">{i18nService.t('starpathMemoryCount').replace('{count}', String(props.total))}</span>
        <div className="settings-inline-actions">
          <button type="button" className="settings-secondary-button" onClick={props.onEditRaw} disabled={props.loading}>
            <EditIcon className="h-3.5 w-3.5" />{i18nService.t('coworkMemoryRawButton')}
          </button>
          <button type="button" className="settings-primary-button" onClick={props.onAdd}>
            <PlusIcon className="h-4 w-4" />{i18nService.t('coworkMemoryCrudCreate')}
          </button>
        </div>
      </div>
      <div className="settings-search-field">
        <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
        <input type="search" value={props.query} aria-label={i18nService.t('coworkMemorySearchPlaceholder')}
          onChange={event => props.onQueryChange(event.target.value)} placeholder={i18nService.t('coworkMemorySearchPlaceholder')} />
      </div>
      {props.loading ? <p role="status" className="settings-empty-state">{i18nService.t('loading')}</p>
        : !props.entries.length ? (
          <div className="settings-empty-state">
            <span className="settings-empty-icon"><SettingsNavigationIcon name="coworkMemory" /></span>
            <h4>{i18nService.t(props.query.trim() ? 'starpathMemoryNoResults' : 'coworkMemoryEmpty')}</h4>
            <p>{i18nService.t(props.query.trim() ? 'starpathMemorySearchHint' : 'starpathMemoryEmptyHint')}</p>
          </div>
        ) : <div className="settings-memory-list">
          {groups.map((group, index) => <React.Fragment key={group.section ?? `ungrouped-${index}`}>
            {group.section && <h4 className="settings-memory-group">{group.section}<span>{group.entries.length}</span></h4>}
            {group.entries.map(entry => {
              const isLong = entry.text.split('\n').length > 3 || entry.text.length > 240;
              const expanded = props.expandedIds.has(entry.id);
              return <article key={entry.id} className="settings-memory-item">
                <div className="min-w-0 flex-1">
                  <p className={`whitespace-pre-wrap break-words leading-relaxed ${isLong && !expanded ? 'line-clamp-3' : ''}`}>{entry.text}</p>
                  {isLong && <button type="button" aria-expanded={expanded} onClick={() => props.onExpand(entry.id)} className="settings-text-button">
                    {i18nService.t(expanded ? 'coworkMemoryCollapse' : 'coworkMemoryExpand')}
                  </button>}
                </div>
                <div className="settings-memory-item-actions">
                  <button type="button" aria-label={i18nService.t('edit')} onClick={() => props.onEdit(entry)} className="settings-icon-button"><EditIcon className="h-4 w-4" /></button>
                  <button type="button" aria-label={i18nService.t('delete')} onClick={() => setPendingDelete(entry)} disabled={props.loading} className="settings-icon-button settings-danger-button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </article>;
            })}
          </React.Fragment>)}
        </div>}
      {pendingDelete && <Modal onClose={() => setPendingDelete(null)} onEscape={() => setPendingDelete(null)}
        overlayClassName="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-5"
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-modal">
        <h3 className="text-sm font-semibold text-foreground">{i18nService.t('starpathMemoryDeleteTitle')}</h3>
        <p className="mt-2 text-xs leading-5 text-secondary">{i18nService.t('starpathMemoryDeleteHint')}</p>
        <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface-raised p-3 text-xs text-foreground">{pendingDelete.text}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="settings-secondary-button" onClick={() => setPendingDelete(null)}>{i18nService.t('cancel')}</button>
          <button type="button" className="settings-primary-button" onClick={() => {
            props.onDelete(pendingDelete);
            setPendingDelete(null);
          }}>{i18nService.t('delete')}</button>
        </div>
      </Modal>}
    </section>
  );
}
