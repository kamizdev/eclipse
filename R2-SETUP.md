# Eclipse — Supabase DB + Cloudflare R2 Audio

Questa versione mantiene Supabase per Auth/PostgreSQL e sposta SOLO i file audio su Cloudflare R2.

## Cosa cambia

- `app.js`: gli stem vengono scaricati dal Worker R2 invece che da Supabase Storage.
- `admin.js`: upload e delete passano dal Worker.
- `r2-client.js`: URL audio e chiamate admin al Worker.
- `worker.js`: serve gli MP3 da R2 e verifica il ruolo `admin` prima di upload/delete.
- IndexedDB resta attiva.
- Il mixer Web Audio resta invariato.
- `schema.sql` resta compatibile: `stems.file_path` continua a contenere il path dell'oggetto.

## Setup Cloudflare

1. Crea un bucket R2 chiamato `eclipse-audio`.
2. Crea un Worker e assegna il binding R2:
   `AUDIO_BUCKET -> eclipse-audio`.
3. Imposta nel Worker:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. In `worker.js`, sostituisci `https://YOUR-DOMAIN.example` con il dominio reale di Eclipse.
5. Deploy del Worker.
6. In `r2-client.js`, imposta:
   `window.ECLIPSE_R2_URL = "https://...";`

### Wrangler

```bash
npm install -g wrangler
wrangler login
wrangler r2 bucket create eclipse-audio
wrangler deploy
```

## Importante: chiavi

Nel Worker puoi usare la Supabase **publishable/anon key**. Non mettere mai la `service_role` key nel repository o nel browser.

## File già presenti in Supabase

Il codice aggiornato cerca i file in R2 con lo stesso `file_path` che è già salvato in `public.stems`.

Quindi prima di spegnere Supabase Storage devi copiare gli oggetti esistenti nel bucket R2 mantenendo gli stessi path, per esempio:

`<song-uuid>/1712345678-stem.mp3`

I record della tabella `stems` non vanno modificati.

## Migrazione nuova installazione

Per i nuovi upload, il flusso è:

Browser -> Worker -> R2
             |
             +-> verifica JWT Supabase + ruolo admin

e poi:

Browser -> Supabase -> INSERT in `stems`

## Cosa resta invariato

- login;
- utenti e profili;
- ruoli admin;
- database;
- RLS;
- mixer;
- mute/solo/volume;
- playback speed;
- loop A/B;
- IndexedDB cache.

## Nota sulle prestazioni

Il player continua a usare `fetch()` + `arrayBuffer()` + `decodeAudioData()` perché il mixer attuale lavora con `AudioBuffer`.

R2 migliora storage, distribuzione e cache HTTP, ma non trasforma questo player in streaming progressivo. Se gli MP3 sono già ragionevolmente piccoli, questa è una modifica relativamente semplice e poco invasiva.

Un'eventuale fase successiva potrebbe passare il playback a `HTMLAudioElement` + `MediaElementAudioSourceNode`, così il browser può iniziare a riprodurre un MP3 senza attendere il download/decoding completo. È però una modifica più ampia al motore di sincronizzazione del mixer, quindi l'ho lasciata fuori da questa migrazione.
