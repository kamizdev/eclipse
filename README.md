# Band DAW — Local Stem Player

Piccola DAW/player web per studiare e provare brani musicali usando stem separati.

## Caratteristiche

- HTML + CSS + JavaScript vanilla
- Web Audio API
- Nessun framework e nessun build system
- File audio elaborati localmente nel browser
- Selezione multipla di stem
- Un `AudioBufferSourceNode` per stem
- `GainNode` per ogni traccia + master gain
- Play / Pause / Stop
- Seek
- Velocità 50–120%
- Mute / Solo
- Loop A/B
- Durata globale = durata massima degli stem
- `localStorage` per impostazioni delle tracce e controlli globali
- Layout responsive per desktop, tablet e mobile

## File supportati

Dipende dai codec disponibili nel browser. In genere:

- WAV
- MP3
- OGG
- M4A/AAC quando il browser lo supporta

Un file che non può essere decodificato viene ignorato con un messaggio di errore; gli altri stem vengono comunque caricati.

## Sincronizzazione

La riproduzione non usa elementi `<audio>` indipendenti.

Il grafo audio è:

```text
AudioBufferSourceNode
        ↓
     GainNode
        ↓
   Master Gain
        ↓
AudioContext.destination
```

Quando parte la riproduzione, tutti i source node vengono creati e avviati usando lo stesso clock di `AudioContext`.

Importante: `AudioBufferSourceNode` è "one-shot". Dopo `start()` non viene riutilizzato. Per pause, seek, cambio velocità e loop, l'app ferma i source correnti e ne crea di nuovi con l'offset corretto.

La posizione logica è calcolata rispetto a `AudioContext.currentTime`, non rispetto al rendering della pagina.

## Stem di durata diversa

La durata della sessione è la durata massima degli stem.

Se uno stem è più corto, semplicemente termina quando raggiunge la fine del proprio `AudioBuffer`; gli altri continuano.

Se la differenza tra lo stem più lungo e quello più corto supera 50 ms, l'interfaccia lo segnala.

## Mute / Solo

- Nessun Solo: ogni traccia segue il proprio volume e Mute.
- Almeno un Solo: sono udibili solo le tracce in Solo.
- Mute ha priorità su Solo.
- Il volume resta indipendente dallo stato Solo.

## localStorage

Vengono salvati, quando disponibile:

- volume delle singole tracce
- Mute
- Solo
- velocità
- Loop ON/OFF
- A/B

Gli audio **non** vengono salvati in `localStorage`.

La chiave della traccia usa nome file, dimensione e `lastModified`, quindi le impostazioni possono essere ripristinate quando gli stessi file vengono selezionati nuovamente.

## Esecuzione locale

### Metodo più semplice

Per una prova veloce puoi aprire `index.html` direttamente nel browser.

Se il browser impone restrizioni particolari sui file locali, usa un piccolo server HTTP locale.

Per esempio, se hai Python installato:

```bash
python3 -m http.server 8000
```

Poi apri:

```text
http://localhost:8000
```

Non è richiesto alcun backend: il server serve soltanto i tre file statici.

## Test con 5–6 stem

1. Prepara 5–6 file della stessa canzone, per esempio:
   - `Song - Vocals.wav`
   - `Song - Guitar.wav`
   - `Song - Bass.wav`
   - `Song - Drums.wav`
   - `Song - Keys.wav`
   - `Song - Backing Vocals.wav`
2. Clicca **Carica stem**.
3. Seleziona tutti i file contemporaneamente.
4. Premi **Play**.
5. Prova Mute e Solo.
6. Prova il seek.
7. Prova una velocità diversa da 100%.
8. Imposta A e B durante la riproduzione e abilita Loop.

Per un test serio di sincronizzazione, esporta gli stem partendo dallo stesso punto temporale e con la stessa durata nominale.

## Note sui file locali

Il browser non carica gli audio su un server. I file vengono letti tramite `File.arrayBuffer()` e passati a `decodeAudioData()`.

I `File` e gli `AudioBuffer` restano nella memoria della scheda/browser per la sessione.

Molti stem o file WAV molto grandi possono richiedere parecchia RAM: la prima versione decodifica i file uno alla volta per limitare i picchi di memoria.

## Pubblicazione successiva

Essendo un progetto statico, la versione base può essere pubblicata su qualunque hosting statico che serva HTML/CSS/JS.

Esempi:

- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel

Per questa versione non serve cambiare il codice per aggiungere un backend: il caricamento degli stem continuerà a essere locale.

In una fase futura il layer di persistenza può essere separato da quello audio per aggiungere archivio online, autenticazione e storage cloud.

## Sviluppi futuri consigliati

Una possibile evoluzione senza stravolgere la struttura:

1. separare `AudioEngine`, `Track`, `Transport` e `Storage`
2. waveform tramite canvas
3. marker e regioni
4. metronomo e count-in
5. loop salvati
6. pitch shifting
7. pan stereo
8. EQ per traccia
9. note/commenti
10. setlist
11. archivio online e autenticazione
12. sincronizzazione delle impostazioni tra dispositivi

La Web Audio API rimane il livello audio principale; backend e cloud possono essere aggiunti sopra, senza trasformare il player locale in un'applicazione dipendente dal server.
