# Distribusjon og drift

RailCAD er en ren nettleserapp: ingen server, ingen innlogging og ingen data som forlater maskinen. Prosjekter lagres som filer du laster ned; en kladd ligger i nettleserens lokale lagring.

## Bygge

```sh
npm ci
npm run build          # gir apps/web/dist (statiske filer)
```

Bygget bruker relative stier (`base: './'`), så mappen kan legges hvor som helst: på en filserver, i en undermappe på en intern webserver eller på en minnepinne. **Verifisert:** `dist` kopiert til en undermappe (`/railcad/`) og servert med en vanlig statisk server – appen starter, sporfelt-eksempelet og 3D-oversikten åpnes, PDF- og PNG-bakgrunn importeres, uten konsollfeil (Chromium).

Åpning direkte fra filsystemet (`file://`) er **ikke** testet og støttes ikke garantert (nettlesere blokkerer ES-moduler og web workers der). Bruk en webserver, eller `npm run preview` lokalt (port 4173).

## Krav til server

- Statisk fil-tjening. Ingen spesiell konfigurasjon, ingen URL-omskriving (det finnes ikke ruter).
- Riktig MIME-type for `.js` (`text/javascript`), `.mjs` (PDF-arbeideren) og `.css`.
- Anbefalt: HTTPS og komprimering (gzip/brotli). Hovedfilen er ca. 530 kB (160 kB gzip); 3D-delen (`three`) ligger i en egen fil på ca. 550 kB som først lastes når 3D-oversikten åpnes.
- Valgfritt sikkerhetshodet (appen laster ingenting fra eksterne adresser): `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'`.

## Nettlesere

Testet automatisk: **Chromium** (alle e2e-tester) og **Firefox 157** (e2e; `npm run test:e2e:firefox`, 72 av 75 bestått i første kjøring og de resterende 3 – 3D-visning og ytelsestest – består når de kjøres alene; de går på tidsgrenser når mange arbeidere deler maskinen). **Safari/WebKit er ikke testet.** 3D-oversikten krever WebGL; uten WebGL vises en feilmelding og resten av appen fungerer.

## Oppdatering og versjonering

- Prosjektfilen har `schemaVersion` (0.1.0). Nye felt er additive (valgfrie); eldre filer åpnes uendret. Ukjent `schemaVersion` avvises med forklaring.
- Ta vare på prosjektfilene dine (`*.railcad.json`) – det er de som er «databasen». Bibliotekfilen (`*.bibliotek.json`) deler egne veksltyper.

## Sikkerhet

- `npm audit`: 0 kjente sårbarheter (kontrollert ved siste bygg).
- Filer som åpnes valideres (struktur, tall, invarianter, størrelse). DXF-import har en grense mot «bomber», bilder nedskaleres, PDF leses med pdf.js i en worker.
- Appen sender ingenting over nettverket. Åpne bare filer du stoler på – som for all programvare som leser filer.
