# Profiles and the demo space

A **profile** is a complete configuration: which folders gtdpara uses, your focus counts, Tag Rules, review dates, the calendar and Gmail setup and the experimental switches. You can keep several and switch between them - for example your real setup and a demo setup for trying things out.

## Profiles

Go to **Settings → Advanced**. The Profiles list shows every profile; the active one has a ●.

- **Save** writes the active profile to its file.
- **Switch** changes to another profile, after you confirm in the status line. gtdpara saves the current profile first, then loads the other one and starts the app fresh with it.
- While a profile other than Production is active, its name (for example `DEMO`) is shown in the tab bar. Tap it to get back to the profile list.

The first time you open the list, your current setup is saved as `production.json`, so you can always switch back to it.

## What switches and what doesn't

Switches with the profile: folders, focus counts, Tag Rules, review state, focus mode, calendar and Gmail setup, experimental switches, recent tags.

Stays the same for all profiles: keep tabs in memory, performance tracing, debug logging.

## Profile files

Profiles are files in `EXPORT/gtdpara/profiles`, one `.json` file per profile. To import a profile, copy its file into that folder and tap **Refresh list**. To share your Tag Rules or folder setup, share the file.

The Gmail app password and the calendar link are never written into these files. They stay inside the plugin, separately for each profile.

## The demo space

**Create demo space** writes a small fictional setup to `Note/gtdpara-demo`: five projects (one on hold, one done), three areas and an Inbox (in `2 Areas/0 Inbox`), with todos, meetings, tags, focus and goals. Dates are set relative to today, so it always looks current. It also adds the profile "Demo" that points to these folders.

Existing files are never overwritten. To start the demo from scratch, delete the `Note/gtdpara-demo` folder and create it again.

The demo space is useful for:

- trying out gtdpara before using it with your own data
- testing Tag Rules or new features without touching your real notes
- reproducing a problem, so that others can see exactly the same thing
