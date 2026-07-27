#!/bin/bash
# 创建一个128x128的蓝色图标，中间有白色裁切框符号
convert -size 128x128 xc:'#1976d2' \
  -fill none -stroke white -strokewidth 4 \
  -draw "rectangle 25,25 103,103" \
  -draw "line 25,40 25,25 40,25" \
  -draw "line 88,25 103,25 103,40" \
  -draw "line 25,88 25,103 40,103" \
  -draw "line 88,103 103,103 103,88" \
  icon.png
