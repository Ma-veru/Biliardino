# Manuale d'uso — Gestione Torneo Giallo

Guida pratica per organizzare e gestire un torneo di biliardino a sorteggio, dalla creazione dei giocatori fino ai playoff finali.

---

## 1. Primo avvio

L'app è una singola pagina web (`index.html`) che funziona direttamente nel browser, senza bisogno di installazione su un server: basta aprirla su computer, tablet o smartphone.

**Dove sono salvati i dati?**
Tutti i dati (giocatori, calendario, risultati, impostazioni) restano salvati **solo su questo dispositivo/browser** (tecnologia `localStorage`). Non c'è un server condiviso: se cambi dispositivo o cancelli i dati del browser, i dati si perdono, a meno di aver fatto un backup (vedi sezione 9).

**Uso offline**
Dopo il primo caricamento (con connessione internet), l'app può funzionare anche senza rete: se il tuo dispositivo lo supporta, ti verrà proposto di "installarla" come una vera app (icona sulla schermata Home). Ti consigliamo di farlo prima del giorno del torneo, così eviti sorprese se il locale ha poco Wi-Fi.

---

## 2. Struttura dell'interfaccia

- **Menu laterale** (a sinistra su desktop, in basso su mobile): permette di passare tra le sezioni — Dashboard, Giocatori, Calendario, Classifica, Playoffs, Impostazioni.
- **Barra in alto**, sempre visibile, con tre pulsanti:
  - **Annulla / Ripeti**: annullano o ripristinano l'ultima azione importante (aggiunta giocatore, generazione calendario, inserimento risultato, ecc.).
  - **Stampa**: stampa la sezione corrente in un formato pulito, senza pulsanti e menu (utile per stampare tabelloni o calendari da appendere al muro).

---

## 3. Dashboard

Pagina iniziale con una panoramica rapida:
- Numero totale di giocatori, partite in calendario, partite già giocate.
- Top 5 della classifica.
- Grafico delle partite giocate per giocatore.
- Pulsanti per **backup dati** (vedi sezione 9).

---

## 4. Gestione Giocatori

### Aggiungere giocatori
- **Uno alla volta**: inserisci nome, scegli il ruolo (Portiere o Attaccante), premi **Aggiungi**.
- **In blocco**: premi **Multiplo**, incolla un elenco di nomi (uno per riga) nella finestra che si apre, scegli il ruolo comune e importa. Utile per registrare velocemente tanti iscritti.

Non è possibile registrare due giocatori con lo stesso nome (l'app lo segnala).

### Modificare o rimuovere
- Icona matita: rinomina il giocatore.
- Icona cestino: rimuove il giocatore **e aggiorna automaticamente il calendario**, eliminando le partite in cui era coinvolto.

### Ordinamento della lista
Il menu a tendina sopra la lista permette di scegliere come visualizzare i giocatori:
- Ordina per Nome
- Alterna P/A (un Portiere, un Attaccante, a turno)
- **Portieri, poi Attaccanti** (impostazione predefinita)
- Attaccanti, poi Portieri

---

## 5. Generazione del Calendario

### Come funziona il sorteggio
Premendo **Genera Calendario**, l'app forma automaticamente le coppie Portiere+Attaccante e le partite tra coppie, cercando di rispettare due regole, in ordine di priorità:

1. **Nessuna coppia ripetuta** (stesso Portiere con lo stesso Attaccante in due round diversi) — evidenziata in **rosso** se capita comunque.
2. **Minor numero di avversari ripetuti possibile** — evidenziata in **giallo/ambra** se capita.

L'algoritmo prova migliaia di combinazioni internamente e sceglie la migliore trovata. Se i Portieri e gli Attaccanti non sono in numero uguale, il gruppo più numeroso riposa a rotazione, in modo che tutti giochino un numero di partite il più possibile equilibrato.

Il numero di partite per giocatore e altri parametri si impostano nella sezione **Impostazioni** (vedi sezione 8).

### Leggere il calendario
Le partite sono raggruppate per Round. Ogni riga mostra:
- Le due squadre (Portiere + Attaccante).
- Il campo per inserire il risultato.
- Lo stato della partita: **Da giocare**, **In corso** o **Giocata**.

Un'icona rossa o gialla accanto al numero di partita segnala rispettivamente una coppia ripetuta o un avversario ripetuto.

### Segnare una partita come "In corso" e i suggerimenti automatici
Durante un torneo dal vivo, più tavoli giocano contemporaneamente. Per aiutarti a organizzare i turni:

- Premi **Avvia** su una partita per segnarla come **"In corso"**: i 4 giocatori coinvolti risultano "occupati".
- In cima al Calendario trovi il pannello **"Partite Pronte da Iniziare"**: mostra automaticamente solo le partite i cui 4 giocatori sono *tutti liberi* in questo momento, con un pulsante **Avvia** rapido per ciascuna.
- Quando inserisci il risultato finale di una partita, lo stato "In corso" si toglie da solo e i giocatori tornano disponibili per il prossimo suggerimento.

Puoi avere **più partite "In corso" insieme** (una per ogni tavolo fisico che stai usando).

### Inserire i risultati
Basta scrivere i due punteggi negli appositi campi: il salvataggio è automatico appena esci dal campo (non serve premere un pulsante). L'app segnala con un avviso se nessuna delle due squadre ha raggiunto il "gol target" impostato (probabile errore di battitura).

### Resettare il calendario
Il pulsante **Resetta** cancella tutte le partite generate (e i risultati inseriti). Chiede conferma prima di procedere, perché l'azione elimina i punteggi.

---

## 6. Classifica

Calcolata automaticamente dalle partite giocate, secondo le regole di punteggio impostate (vedi sezione 8). Colonne:

| Colonna | Significato |
|---|---|
| Pts | Punti totali |
| G | Partite giocate |
| V / N / P | Vittorie / Pareggi / Sconfitte |
| GF / GS | Gol Fatti / Gol Subiti |
| Diff | Differenza reti |

Il numero di partite giocate (G) appare in **rosso** se il giocatore ne ha giocate meno del target impostato, in **arancione** se ne ha giocate di più — utile per individuare squilibri nel calendario.

---

## 7. Playoffs

1. Vai in **Playoffs** e premi **Genera Tabellone**: i migliori N giocatori in classifica (N impostabile in Impostazioni) accedono a un tabellone a eliminazione diretta.
2. Se il numero di qualificati è dispari, l'ultimo classificato del gruppo riceve un **turno libero (BYE)** che lo fa avanzare **automaticamente** al turno successivo, senza bisogno di alcuna azione.
3. Per ogni partita del tabellone, clicca sul nome del giocatore vincitore: il risultato si propaga da solo al turno successivo.

---

## 8. Impostazioni

- **Regole di punteggio**: punti per vittoria netta, vittoria/sconfitta di misura (1 gol di scarto), pareggio, sconfitta netta.
- **Gol Target**: punteggio che determina la vittoria di una partita (usato anche per l'avviso di risultato anomalo nel Calendario).
- **Partite Target per Giocatore**: quante partite l'algoritmo di sorteggio cerca di far giocare a ciascun giocatore.
- **Top N Giocatori per Playoff**: quanti giocatori qualificarsi ai playoff.
- **Zona Pericolosa**: **Reset Totale Database** cancella definitivamente giocatori, calendario e classifica. Da usare solo per ricominciare da zero un nuovo torneo.

---

## 9. Backup, ripristino e stampa

Poiché i dati restano solo sul dispositivo in uso, è consigliabile fare un backup, specialmente prima di eventi importanti (fine giornata, cambio dispositivo):

- **Esporta Dati JSON** (in Dashboard): scarica un file con tutti i dati del torneo.
- **Importa Dati JSON**: ripristina un backup precedente (sovrascrive i dati attuali).
- **Esporta PDF Classifica**: genera un PDF stampabile della classifica attuale.
- **Stampa** (barra in alto): stampa la vista corrente (es. calendario con caselle vuote per segnare i risultati a mano, utile come "foglio gara" cartaceo di riserva).

---

## 10. Consigli pratici per il giorno del torneo

- Installa l'app come PWA e aprila almeno una volta **prima** del torneo, così funziona anche con poco Wi-Fi.
- Fai un **export JSON di backup** a fine di ogni round o fase importante.
- Usa il pannello **"Partite Pronte da Iniziare"** per assegnare rapidamente le partite ai tavoli liberi, evitando di dover controllare a mente chi sta già giocando.
- In caso di errore, usa sempre **Annulla** prima di modificare manualmente i dati.

---

## 11. Domande frequenti

**Ho rinominato un giocatore ma il tabellone playoff mostra ancora il vecchio nome?**
Il tabellone si aggiorna automaticamente al nome più recente — se noti un'incongruenza, prova a tornare alla Dashboard e poi rientrare in Playoffs per forzare il ricaricamento della vista.

**Posso usare l'app su più dispositivi contemporaneamente?**
No: i dati non sono condivisi tra dispositivi. Un solo dispositivo deve fare da "regia" del torneo; gli altri possono solo consultare una stampa o un export condiviso manualmente.

**Ho perso i dati, cosa faccio?**
Se avevi fatto un export JSON, usa **Importa Dati JSON** in Dashboard per ripristinarli. Senza backup, i dati cancellati da `localStorage` non sono recuperabili.
