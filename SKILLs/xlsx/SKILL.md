---
name: xlsx
description: 创建、检查或编辑 Excel 表格与 CSV/TSV 数据，处理公式、格式、图表和数据分析；用于表格文件工作。
license: MIT
metadata:
  version: 2.0.0
  author: StarPath
---

# 星途表格

用 `STARPATH_PYTHON` 的随包 Python；`openpyxl` 编辑现有 XLSX/XLSM，`xlsxwriter` 可创建新文件，`csv` 处理 CSV/TSV。技能脚本在 `SKILLS_ROOT/xlsx/scripts`。

## 读取与编辑

`sheets.py inspect 输入.xlsx` 输出工作表、行列数、公式位置与错误值概况。读取大表时限定工作表和范围，避免把所有用户数据输出到日志。

编辑现有文件先确认目标单元格、公式与数据类型。公式工作簿用 `data_only=False` 打开，XLSM 额外使用 `keep_vba=True`；结果另存，保留原文件。不要把带公式的工作簿以 `data_only=True` 保存。涉及透视表、复杂图形、签名或外部连接时，先确认所选库能保留相关结构。

生成表格时分清输入、计算和结果，按内容使用日期、数字、百分比与货币格式；数据单位写清楚，表头和图例保持简洁。已有模板的风格优先，不能把自定配色强加给用户。

## 计算验证

`openpyxl` 保存公式但不负责计算。缓存读取不到结果，不能等同于结果为零。`sheets.py recalc 输入.xlsx 输出.xlsx` 使用系统已安装或 `STARPATH_LIBREOFFICE` 指定的 LibreOffice 独立配置目录重算；工具缺失时明确报错，不下载、不假装重算。

重算后重新打开 `data_only=True` 检查关键结果及错误值；对公式边界、空值、百分比和跨表引用使用具体数据验证。复杂业务计算按用户的数据口径，不能编造结果。CSV/TSV 不能保留公式和样式，转换时说明这一点；旧 XLS/ET 文件要先用可用的软件转换。

给出结果文件路径引用、关键数据结论、完成的核对及未完成项。用户可在右侧预览，复杂公式和宏需在对应软件中验收。
