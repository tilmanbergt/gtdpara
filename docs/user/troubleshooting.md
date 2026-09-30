# Troubleshooting and reporting problems

## Common situations

- **"gtdpara was updated, but the old version is still loaded"**: tap **Restart** in that message, wait a few seconds, then open gtdpara again. This comes from how the Supernote installs plugin updates.
- **Something looks outdated**: tap 🔄. If it happens often, try switching off **Keep tabs in memory** in Settings → Advanced.
- **A handwritten tag isn't recognized**: a tag must not contain a space after `#`. Quick Add removes such spaces automatically; in files you edited by hand, check them.
- **A note link or linked file is broken**: run **Run Integrity Check** in Settings → Advanced. It writes a report to `EXPORT/gtdpara/debug`.
- **Creating a note fails when gtdpara was opened from a PDF or document**: the Supernote only lets plugins create notes when they were opened from a note. Open gtdpara from any note and create the note there. This is a limit of the Supernote, not of gtdpara.
- **The calendar or Gmail doesn't load**: check the network connection and the settings; the error message tells you whether it is the network, the login or something else.

## Reporting a problem

Reports are very welcome - they are the main way gtdpara gets better. Please report on GitHub: github.com/tilmanbergt/gtdpara, then **Issues → New issue → Bug report**.

To make it easy to find the cause:

1. In **Settings → About**, switch on **Debug logging**.
2. Make the problem happen again.
3. Tap **Export debug bundle**. It saves a text file to `EXPORT/gtdpara/debug`.
4. Copy that file to your computer (USB or Supernote Cloud), look through it, and attach it to the issue.

The bundle contains the version, the device, a summary of your settings without names, counts of your projects and todos, and the recent log. The Gmail app password, calendar links and e-mail addresses are removed automatically. File paths stay in it because they help finding the cause - they can contain project names, so please look before sharing.

If you can make the problem happen in the demo space too, say so. Then it can be reproduced exactly. See [Profiles and the demo space](profiles-and-demo.md).

Switch debug logging off again afterwards; the log file is kept small, but there is no need to keep writing it.

## Ideas and questions

Ideas: **Issues → New issue → Feature request**. Describe the situation you want to improve, not only the solution. Questions: GitHub Discussions.
