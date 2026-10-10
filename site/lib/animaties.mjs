// Overzicht van alle interactieve animaties die in een notitie gebruikt kunnen worden:
//
// ```animatie
// monitor
// ```
//
// Extra instellingen kunnen eronder als "sleutel: waarde" (zie `opties`).
export const ANIMATIES = [
  {
    naam: 'monitor',
    alias: ['ok-monitor', 'patientmonitor', 'patiëntmonitor'],
    element: 'al-monitor',
    titel: 'OK-monitor',
    icoon: '📈',
    beschrijving: 'Live patiëntmonitor met ECG, saturatie, arteriële druk en capnografie. Kies scenario’s zoals hypoxie, bronchospasme of ventrikelfibrilleren.',
    opties: { scenario: 'normaal | tachycardie | bradycardie | hypoxie | hypotensie | bronchospasme | oesofageaal | mh | vf' },
  },
  {
    naam: 'hart',
    alias: ['bloedsomloop', 'circulatie', 'heart'],
    element: 'al-hart',
    titel: 'Bloedstroom door het hart',
    icoon: '🫀',
    beschrijving: 'Volg een rode bloedcel door de kleine en grote circulatie, met kleppen die openen en sluiten in systole en diastole.',
    opties: {},
  },
  {
    naam: 'inductie',
    alias: ['inleiding', 'in-slaap-brengen', 'narcose'],
    element: 'al-inductie',
    titel: 'Inductie van anesthesie',
    icoon: '😴',
    beschrijving: 'Stap voor stap van preoxygenatie tot intubatie, met het effect van elk middel op bewustzijn, bloeddruk en TOF.',
    opties: {},
  },
  {
    naam: 'capnografie',
    alias: ['capnogram', 'co2'],
    element: 'al-capnogram',
    titel: 'Capnografie-patronen',
    icoon: '🌬️',
    beschrijving: 'De fasen van het capnogram en afwijkende patronen herkennen: obstructie, rebreathing, curare-cleft en meer.',
    opties: { patroon: 'normaal | obstructie | rebreathing | curare | oesofageaal | hyperventilatie | hypoventilatie | lageoutput' },
  },
  {
    naam: 'zuurstofcurve',
    alias: ['o2-curve', 'dissociatiecurve', 'odc', 'zuurstofdissociatiecurve'],
    element: 'al-o2curve',
    titel: 'Zuurstofdissociatiecurve',
    icoon: '🩸',
    beschrijving: 'Verschuif de curve met pH en temperatuur en zie wat er met de saturatie bij een gegeven PaO₂ gebeurt.',
    opties: {},
  },
];
