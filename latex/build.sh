#!/usr/bin/env bash
# Build all 4 chart PDFs from chart.tex by passing \species and \theme via \def.
# Output names match what the React app expects.
set -euo pipefail

cd "$(dirname "$0")"

build() {
  local species=$1 theme=$2 jobname
  if [ "$theme" = "vca" ]; then
    jobname="${species}_chart_vca"
  else
    jobname="${species}_chart"
  fi
  # Two passes for tikz `remember picture` cross-references.
  for _ in 1 2; do
    pdflatex -interaction=nonstopmode -jobname="$jobname" \
      "\def\species{$species}\def\theme{$theme}\input{chart.tex}" > /dev/null
  done
  echo "  $jobname.pdf"
}

echo "Building 4 variants from chart.tex:"
build canine socal
build canine vca
build feline socal
build feline vca

# Copy to public/ for the webapp.
cp canine_chart.pdf canine_chart_vca.pdf feline_chart.pdf feline_chart_vca.pdf ../public/
echo "Copied to ../public/"
