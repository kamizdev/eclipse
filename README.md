# BAND DAW

Versione aggiornata del progetto.

## Cosa cambia

- Gli stem vengono caricati in parallelo, massimo 4 alla volta.
- Gli stem già scaricati vengono salvati nella cache IndexedDB del browser.
- Il login Admin usa Nickname + Password.
- L'accesso alle funzioni Admin è protetto dal ruolo `admin` nel database.
- Il pubblico continua a leggere brani e stem senza login.

## Login

Il nickname viene trasformato internamente in un'identità Auth tecnica:

`nickname@users.band-daw.internal`

L'indirizzo tecnico non viene mostrato all'utente.

Il nickname accetta 3-32 caratteri tra lettere, numeri, `.`, `_` e `-`.

## Supabase

Dopo aver eseguito `schema.sql`, crea/migra il tuo utente Auth e rendilo admin con:

```sql
update public.profiles
set role = 'admin'
where nickname = 'IL_TUO_NICKNAME';
```

Non mettere mai la `service_role` key nel frontend.

## Cache audio

La prima apertura scarica e decodifica gli stem.

Le aperture successive possono riutilizzare i file dalla cache locale del browser.
