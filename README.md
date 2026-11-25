# Rally Koop

3D-Rally im Browser (Three.js + Rapier). Ziel: Online-Koop, bei dem einer fährt und der andere als Beifahrer den Aufschrieb vorliest.

## Starten

```
npm install
npm run dev
```

Dann http://localhost:5173 öffnen. `?seed=123` wählt eine andere Strecke, `?autopilot` lässt das Auto selbst fahren (zum Testen).

## Steuerung

W/S Gas/Bremse · A/D Lenken · Leertaste Handbremse · R zurück auf die Strecke · C Kamera · M Ton · B Aufschrieb · V Ansagen · Enter Neustart · N neue Strecke. Gamepad: RT/LT, linker Stick, A Handbremse, Y Zurücksetzen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/track.js` | Erzeugt die Etappe aus einem Seed (Mittellinie pro Meter, Höhe, Kurvigkeit) |
| `src/terrain.js` | Gelände in 128-m-Blöcken, Mesh + Rapier-Heightfield |
| `src/road.js` | Schotterstraße, Wald, Start/Ziel/Split-Tore |
| `src/vehicle.js` | Fahrphysik (Raycast-Fahrzeug, Allrad, Stabilitätshilfe), `TUNING` zum Abstimmen |
| `src/pacenotes.js` | Aufschrieb aus der Strecke: Richtung, Grad 1–6/Haarnadel, lang, zieht zu, macht auf, Kuppe, Achtung, Distanzen |
| `src/pacenoteUI.js` | Beifahrer-Buch (Anzeige) und Sprachansagen |
| `src/carModel.js` | Auto-Modell aus Grundformen |
| `src/effects.js`, `src/audio.js` | Staub, Motor- und Schottergeräusch |
| `src/main.js` | Spielablauf, Kamera, HUD, Zeitmessung |
| `tools/physics-test.mjs` | Fahrverhalten ohne Browser testen: `node tools/physics-test.mjs '{"rearGrip":0.9}'` |

## Fahrplan

1. ✅ Fahren: ein Auto, eine Schotteretappe, Zeitmessung
2. ✅ Aufschrieb (Pacenotes) automatisch aus der Strecke erzeugen, mit Anzeige und Sprachansagen
3. Online-Koop: Raum-Code, Beifahrer-Ansicht auf zweitem Gerät (PeerJS)
4. Meisterschaft: mehrere Länder/Untergründe, Autoauswahl, Schaden und Reparatur
