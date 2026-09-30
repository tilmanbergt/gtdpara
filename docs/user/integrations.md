# Google Calendar and Gmail (experimental)

Both integrations are **experimental**: they depend on Google's services, can be slow on the Supernote and may stop working when Google changes something. They are off until you switch them on in **Settings → Advanced**. Switching one off only hides it; its settings are kept.

The Supernote needs a network connection for both. gtdpara only connects when you tap Load or Refresh.

## Google Calendar

gtdpara reads your calendar through its private address in iCal format. It only reads; nothing is written to Google.

1. On a computer, open Google Calendar, then the settings of your calendar, and copy the **secret address in iCal format**.
2. Switch on Google Calendar in Settings → Advanced.
3. Paste the address in **Settings → Calendar** and tap **Save**.

A **Google** tab then appears in Daily, Week, Month, Inbox, a project's Current tab and the Review's Week ahead step. Tap **Load Google Calendar**. You can copy an event into a gtdpara meeting with one tap; copied events get a check mark, and **Hide existing** hides them. Events copied on the Month tab become monthly highlights.

Keep the secret address private - anyone who has it can read your calendar. You can reset it in Google Calendar.

## Gmail

gtdpara reads your Gmail inbox over IMAP with an **app password**, not your normal password.

1. In your Google account, turn on 2-step verification (required for app passwords) and create an app password.
2. Switch on Gmail in Settings → Advanced.
3. In **Settings → Gmail**, enter your Gmail address and the app password, and tap **Save**.

The Weekly Review then has a **Gmail inbox** step. Tap **Load Gmail inbox**, open an email and:

- create todos or meetings from it; select text in the email and tap **→ Todo** or **→ Meeting** to use it
- save PDF, EPUB or text attachments into the project and link them
- save the email text as a note
- archive the email in Gmail when you are done

Emails you have created something from get a check mark during the review. The option **Hide emails already turned into a Task/Meeting** in Settings → Gmail hides them.

The app password is stored inside the plugin on the Supernote. You can revoke it in your Google account at any time.
