# Settings

Settings has these tabs:

## Folders

The base folder and the names of the Projects, Areas, Resources and Archive folders, and of the **Inbox folder** inside Areas. Below each field you see the full path. Tap **Save** at the bottom after changing something (the same on the Focus, Calendar and Gmail tabs).

Changing a folder name only changes where gtdpara looks; move the folder yourself. The Inbox folder is the exception: a new name renames the folder on Save. Save refuses a name that another folder in Areas already has.

## Focus

How many projects and areas fit into daily, weekly and monthly focus. Lowering a number never removes anything from focus; it only prevents adding more.

## Calendar and Gmail

Two tabs, only visible when the matching experimental integration is switched on in Advanced. See [Google Calendar and Gmail](integrations.md).

## Tag Rules

How new notes look, see [Note templates](note-templates.md). A rule is saved with **Create** or **Save** in its editor; the Save button at the bottom isn't needed here.

## Advanced

- **Profiles**: switch between configurations and create the demo space, see [Profiles](profiles-and-demo.md)
- **Experimental**: switch the Google Calendar and Gmail integrations on or off
- **Reload all files**: reads all projects, areas and the Inbox again, for every tab. Use it after changing files outside gtdpara, for example on your computer or in Obsidian.
- **Run Integrity Check**: looks for broken note links and similar file problems, including Inbox files left in `Note` by an unfinished move and a project close-out that was interrupted, and writes a report to `EXPORT/gtdpara/debug`
- **Keep tabs in memory**: Daily, Week, Month, Current, Projects and Areas stay loaded, so switching tabs is fast. Turn it off if something looks outdated.
- **Performance tracing**: for measuring speed; leave it off normally

Switches on this tab take effect immediately.

## About

- version, build number and device
- **Debug logging** and **Export debug bundle**, see [Troubleshooting](troubleshooting.md)
- **What's new**: the release notes of this and earlier versions
