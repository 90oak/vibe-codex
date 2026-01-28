# Deluge console label command troubleshooting

If you see:

```
deluge-console: error: argument Command: invalid choice: 'label'
```

that means the **Label** plugin is not installed or enabled in the daemon you are
connected to. The `label` command is provided by the plugin, so the base
`deluge-console` command list will not include it until the plugin is available.

## Correct console syntax

1. **Connect to the daemon** (if you are not already connected):

   ```bash
   deluge-console "connect <host>:<port> <user> <pass>"
   ```

2. **Enable the Label plugin** on the daemon:

   ```bash
   deluge-console "plugin enable Label"
   ```

3. **Use the label subcommand** once the plugin is enabled:

   ```bash
   deluge-console "label add <label-name>"
   deluge-console "label list"
   deluge-console "label set <label-name> <torrent-id>"
   ```

If `plugin enable Label` fails, make sure the **Label** plugin is installed on
both the daemon and the UI host (or wherever Deluge plugins are installed for
your environment), then restart the daemon and try again.
