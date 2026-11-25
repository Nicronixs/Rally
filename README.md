# Rally Koop

3D-Rally im Browser (Three.js + Rapier). Ziel: Online-Koop, bei dem einer fährt und der andere als Beifahrer den Aufschrieb vorliest.

## Starten

```
npm install
npm run dev
```

Dann http://localhost:5173 öffnen. `?seed=123` wählt eine andere Strecke, `?autopilot` lässt das Auto selbst fahren (zum Testen).

## Koop spielen

1. Fahrer: „Raum erstellen“ – es erscheint ein 5-stelliger Code.
2. Beifahrer (zweites Gerät): Code eingeben, „Beitreten“. Hat der Beifahrer eine andere Strecke geladen, wechselt er automatisch auf die des Fahrers.
3. Fahrer: „Etappe starten“. Der Fahrer sieht keinen Aufschrieb und hört keine Ansagen – der Beifahrer liest vor (am Tisch oder über Discord).

Der Beifahrer sieht vom Beifahrersitz aus mit großem Aufschrieb und „noch … m“ bis zur nächsten Ansage. Das Auto des Fahrers wird etwa 20× pro Sekunde übertragen und ~100 ms verzögert flüssig dargestellt.

Damit das zweite Gerät das Spiel überhaupt öffnen kann, muss es erreichbar sein:
- im selben WLAN: `npm run dev -- --host` und auf dem zweiten Gerät `http://<IP-des-PCs>:5173` öffnen
- über das Internet: das Spiel veröffentlichen (z. B. GitHub Pages)

Die Verbindung selbst läuft direkt zwischen den beiden Browsern (WebRTC); der öffentliche PeerJS-Server vermittelt nur den Code. In sehr strengen Netzwerken (manche Firmen-/Uni-Netze) kann die direkte Verbindung scheitern.

## Steuerung

W/S Gas/Bremse · A/D Lenken · Leertaste Handbremse · R zurück auf die Strecke · C Kamera (Cockpit, Verfolger, Motorhaube) · M Ton · B Aufschrieb · V Ansagen · Enter Neustart · N neue Strecke. Gamepad: RT/LT, linker Stick, A Handbremse, Y Zurücksetzen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/track.js` | Erzeugt die Etappe aus einem Seed (Mittellinie pro Meter, Höhe, Kurvigkeit) |
| `src/terrain.js` | Gelände in 128-m-Blöcken, Mesh + Rapier-Heightfield |
| `src/road.js` | Schotterstraße, Wald, Start/Ziel/Split-Tore |
| `src/vehicle.js` | Fahrphysik (Raycast-Fahrzeug, Allrad, Stabilitätshilfe), `TUNING` zum Abstimmen |
| `src/pacenotes.js` | Aufschrieb aus der Strecke: Richtung, Grad 1–6/Haarnadel, lang, zieht zu, macht auf, Kuppe, Achtung, Distanzen |
| `src/pacenoteUI.js` | Beifahrer-Buch (Anzeige) und Sprachansagen |
| `src/carModel.js` | Auto-Modell aus Grundformen, Cockpit mit Lenkrad und Überrollkäfig |
| `src/effects.js`, `src/audio.js` | Staub, Motor- und Schottergeräusch |
| `src/net.js` | Koop-Verbindung (PeerJS/WebRTC): Raum-Code, Nachrichten, Herzschlag |
| `src/main.js` | Spielablauf, Kamera, HUD, Zeitmessung |
| `tools/physics-test.mjs` | Fahrverhalten ohne Browser testen: `node tools/physics-test.mjs '{"rearGrip":0.9}'` |

## Fahrplan

1. ✅ Fahren: ein Auto, eine Schotteretappe, Zeitmessung
2. ✅ Aufschrieb (Pacenotes) automatisch aus der Strecke erzeugen, mit Anzeige und Sprachansagen
3. ✅ Online-Koop: Raum-Code, Beifahrer-Ansicht auf zweitem Gerät (PeerJS)
4. Meisterschaft: mehrere Länder/Untergründe, Autoauswahl, Schaden und Reparatur
