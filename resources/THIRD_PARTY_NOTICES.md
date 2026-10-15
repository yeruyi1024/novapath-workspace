# 星途第三方软件声明

星途的品牌、界面与本次独立编写的文档技能由星途维护。应用仍使用开源项目与第三方依赖；其代码、字体和工具不能因更换品牌而归属星途。

- 项目基础代码：原项目 MIT 声明随包保存在 `licenses/upstream-project-LICENSE.txt`，原始版权署名保留。
- OpenClaw 与扩展：版本固定在 `package.json`，对应运行时的 `LICENSE`、`THIRD_PARTY_NOTICES.md` 与扩展许可证随运行时保留。
- Python 与文档依赖：随包运行时保留 Python 的许可证以及各库 `*.dist-info` 中的许可文件；使用版本见 `scripts/document-requirements.txt`。
- 本地语音输入：使用 whisper.cpp（MIT，ggml authors）、Whisper 模型（MIT，OpenAI）及 miniaudio（随源文件提供双许可，保留完整许可）。版本、固定来源及校验值见 `src/shared/asr/local-runtime.json`；实际许可随语音资源保存在 `asr-runtime/licenses/`。星途维护客户端接入，不宣称识别引擎或模型为原创。
- 字体补充声明：Instrument Serif 与 IBM Plex Serif 的 OFL 文本来自 Google Fonts 官方仓库（https://github.com/google/fonts/tree/main/ofl/instrumentserif、https://github.com/google/fonts/tree/main/ofl/ibmplexserif），对应声明放在字体目录中，不改字体或作者名字。
- 其他随包技能与字体：各技能目录中的 LICENSE、NOTICE、OFL 等原始声明继续保留。没有明确来源证明的材料不能仅凭本声明宣称原创。
- 星途文档技能：`docx`、`xlsx`、`pptx`、`pdf` 的 2.0.0 版说明和脚本为本次新写，按各目录 MIT 许可提供。旧的受限技能材料不在本版发行目录中。

该文件是组件索引，不替代各组件实际许可证，也不表示已完成所有历史资源的权利核对。新增依赖、插件或资产须核对其许可和随包声明；用户自行安装的扩展由其实际来源许可约束。
