# Werkafspraken AnesthesioLogisch

## Branchnamen
- Gebruik altijd `feature/<korte-beschrijving>`, in kleine letters met streepjes.
  Voorbeelden: `feature/praktische-vaardigheden`, `feature/quiz-per-hoofdstuk`.
- Bij een bugfix: `fix/<korte-beschrijving>`.
- Gebruik **nooit** automatisch gegenereerde namen zoals `claude/...` of willekeurige woorden.
- Eén branch per feature; na het samenvoegen in `main` wordt de branch verwijderd.

## Taal
- Alle inhoud, commitberichten en pull requests zijn in het Nederlands.

## Project
- Inhoud staat in `inhoud/` (Obsidian-kluis); de bouwcode in `site/`. Zie `README.md`.
- Controleer wijzigingen met `npm run build` (geen waarschuwingen over kapotte links).
- Medische teksten en doseringen zijn onderwijsmateriaal; vermeld in de PR dat ze medisch nagelezen moeten worden.
