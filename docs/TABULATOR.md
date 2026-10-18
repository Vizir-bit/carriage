# Tabulator

Tabulator is a sibling of Carriage styled after the first IBM machines. It is
the same browser, Helium on ungoogled-chromium and Chromium, taken from a
Carriage release and given its own name, icon, profile folder and new tab
page, in the way Orient-Express was made. Repackaging keeps the engine
byte for byte what Carriage ships; a separate compile would cost the ten
chained build jobs of `build.yml` for no difference in the browser itself.

## The new tab page

The page is an operator's console after the IBM 650 Magnetic Drum
Data-Processing Machine (announced 1953, first delivered 1954), the first IBM
computer made in quantity. The 650 worked in bi-quinary decimal and its
console showed each digit with lamps: one of two for 0 or 5, and one of five
for 0 to 4, the digit being their sum. Here a ten-digit word of neon-orange
lamps, its positions numbered 10 to 1 from the left, shows the day, month,
hour, minute and second; four shorter registers show the hour and minute in London, Paris,
Roma and Moscow, each with a lamp lit between 07:00 and 19:00 local time.
Power and Network lamps sit in the panel's header, the second following the
browser's online state. Below the panel lies an 80-column card of the kind IBM
introduced in 1928, punched in IBM 026/029 Hollerith code with the engine
version and the date, and printed along its top edge as a keypunch would.

The page makes no network request. If the source build carries Carriage's
weather plaques, their Open-Meteo request is switched off, since the console
does not show it.

The sources are readable files: `scripts/tabulator/console.js` (the console,
as functions returning Lit templates) and `scripts/tabulator/console.css`.
`scripts/tabulator_ntp_patch.py` splices them into the compiled new tab page
inside `resources.pak`, in place of the Pullman panelling, nameplate and
clocks, and keeps Carriage's one-second clock timer to redraw the lamps.

## How a release is made

Run "Tabulator — repackage a Carriage release as a separate app" from the
Actions tab. The job, on a macOS runner, does the following.

1. Copies the app out of the Carriage release's disk image and sets its name,
   bundle identifier and profile folder to `app.tabulator.browser`; removes
   any Sparkle feed address, so it can never update itself into Carriage.
2. Splices the console into the new tab page.
3. Changes the default theme colour of a new profile from Carriage's mahogany
   to slate (`scripts/tabulator_theme_patch.py`). The colour is compiled
   code, so this rewrites two arm64 instructions in the framework binary; the
   script acts only if it finds exactly the two instruction pairs it expects
   and otherwise leaves the binary untouched, and the release notes then say
   the toolbar is still mahogany.
4. Compiles the icon in `resources/tabulator-icon/` as `icons.yml` compiles
   Carriage's.
5. Signs ad hoc, renders the new tab page headless at two sizes (a script
   error on the page fails the job), checks that the app creates its own
   profile folder, and publishes a prerelease with the disk image, its
   SHA-256 and the screenshots.

On a pull request that touches Tabulator the same job runs as a check, with
the screenshots kept as an artifact and nothing published.

## Tests

`node scripts/tabulator/test_console.mjs` decodes the card's holes back to
its text with an independently written IBM 029 table and checks that every
digit lights exactly its two lamps. The workflow's first job also splices the
console into `dump/res_20462.txt`, a compiled new tab page taken from
Orient-Express 2, and checks that the result parses.

## What still says Carriage, or Helium

The executable, the framework and its helper processes keep Carriage's names,
as in Orient-Express, and so does the logo on the About page. The wording of
menus, dialogs and settings comes from Helium's build, which rewrites
Chromium's name in every interface string to Helium before compiling
(`helium-chromium/utils/name_substitution_utils.py`); Carriage's identity
patch changes the bundle's name, not those strings, and the first run of this
workflow found the word Carriage in none of the 216 `locale.pak` files. So
Tabulator's menus read as Carriage's do. Renaming them by string replacement
would also rename strings that refer to Helium's own services, and misstate
who runs them; doing it properly belongs in a source build, for Carriage and
Tabulator alike. The keychain
item that holds the key for encrypting saved passwords and cookies is
compiled as "Carriage Storage Key": Tabulator asks macOS for access to the
same item, so the two apps share that key, while their profiles stay apart.
