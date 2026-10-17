#!/usr/bin/env python3
"""Apply the Carriage night train UI to the supported Pullman release PAK.
Payload adapted from the existing local installer (439ae3c), railway only:
the sea scene and its RAIL/SEA switch are left out (Nadar, 17 October 2026).
"""
import gzip, hashlib, struct, zlib
from pathlib import Path

class Stop(RuntimeError):
    pass


# Pinned to the arm64 build of d0c628b, run 38823158923 (carriage_0.19.2.1_arm64-macos.dmg),
# which is also the base of the universal merge.
TESTED_PAK_SHA256 = 'bb71350ed3cd05dab893abebcb21753bb33d9b115708ed6b0418d2fe40330d74'

TESTED_RESULT_SHA256 = 'd122babbe600e16b4c68c4bfd2344a23a738f9c6ce94a5d569263829c42d885a'

CSS_FROM, CSS_TO = '#carriagePanelling{', '`])'

HTML_FROM, HTML_TO = '<div id="carriagePanelling"', '${this.lazyRender_'

CLOCK_TIMER = 'this.carriageClockTimer_=window.setInterval((()=>{this.carriageClocks_=carriageClocksNow()}),1e3);'


DONE_MARK = 'carriageTrain'

GZIP_MAGIC = b'\x1f\x8b'

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def read_pak(data):
    """Chromium .pak format 5: header, entry table, aliases, resources."""
    if len(data) < 12:
        raise Stop('resources.pak is too short to be a pak file. '
                   'Nothing has been changed.')
    version = struct.unpack_from('<I', data, 0)[0]
    if version != 5:
        raise Stop('resources.pak is in pak format %d, not 5. '
                   'Nothing has been changed.' % version)
    count, n_alias = struct.unpack_from('<HH', data, 8)
    alias_start = 12 + 6 * (count + 1)
    alias_end = alias_start + 4 * n_alias
    if alias_end > len(data):
        raise Stop('resources.pak is truncated. Nothing has been changed.')
    entries = [struct.unpack_from('<HI', data, 12 + 6 * i)
               for i in range(count + 1)]
    offsets = [offset for _, offset in entries]
    if (offsets[0] != alias_end or offsets[-1] != len(data)
            or any(a > b for a, b in zip(offsets, offsets[1:]))):
        raise Stop('resources.pak has an unexpected layout. '
                   'Nothing has been changed.')
    resources = [(entries[i][0], data[entries[i][1]:entries[i + 1][1]])
                 for i in range(count)]
    return data[:8], resources, data[alias_start:alias_end]

def write_pak(head, resources, aliases):
    count = len(resources)
    out = [head, struct.pack('<HH', count, len(aliases) // 4)]
    offset = 12 + 6 * (count + 1) + len(aliases)
    for rid, blob in resources:
        out.append(struct.pack('<HI', rid, offset))
        offset += len(blob)
    out.append(struct.pack('<HI', 0, offset))
    out.append(aliases)
    out.extend(blob for _, blob in resources)
    return b''.join(out)

def find_new_tab_page(resources):
    hits = []
    for index, (rid, blob) in enumerate(resources):
        if blob[:2] != GZIP_MAGIC:
            continue
        try:
            text = gzip.decompress(blob)
        except (OSError, EOFError, ValueError, zlib.error):
            continue
        if b'carriagePanelling' in text:
            hits.append((index, rid, text))
    return hits

def count_once(js, anchors):
    for name, anchor in anchors:
        found = js.count(anchor)
        if found != 1:
            raise Stop(
                'The new tab page in this Carriage is not the Pullman page '
                'this patch was made for: the %s anchor occurs %d times '
                'instead of once. Nothing has been changed.' % (name, found))

def patch_new_tab_page(js):
    """The edit of ntp_night_train_patch.py at commit 439ae3c, with the
    garden and sea scenes left out of the payload."""
    anchors = (('stylesheet', CSS_FROM), ('markup', HTML_FROM),
               ('clock timer', CLOCK_TIMER))
    count_once(js, anchors)
    for start, end, new, name in ((CSS_FROM, CSS_TO, CSS, 'stylesheet'),
                                  (HTML_FROM, HTML_TO, HTML, 'markup')):
        i = js.index(start)
        j = js.find(end, i)
        if j < 0:
            raise Stop('The end of the Pullman %s was not found. '
                       'Nothing has been changed.' % name)
        js = js[:i] + new + js[j:]
    count_once(js, anchors[2:])
    js = js.replace(CLOCK_TIMER, '', 1)
    return js

def build_new_pak(original):
    """Returns (new pak bytes, resource id), or (None, rid) if already done."""
    head, resources, aliases = read_pak(original)
    if write_pak(head, resources, aliases) != original:
        raise Stop('resources.pak could not be read back exactly. '
                   'Nothing has been changed.')
    hits = find_new_tab_page(resources)
    if not hits:
        raise Stop('No Carriage new tab page was found in resources.pak. '
                   'Nothing has been changed.')
    if len(hits) > 1:
        raise Stop('resources.pak holds %d Carriage new tab pages instead '
                   'of one. Nothing has been changed.' % len(hits))
    index, rid, raw = hits[0]
    try:
        js = raw.decode('utf-8')
    except UnicodeDecodeError:
        raise Stop('The new tab page is not valid UTF-8. '
                   'Nothing has been changed.')
    if DONE_MARK in js:
        return None, rid
    new_js = patch_new_tab_page(js).encode('utf-8')
    if sha256(original) == TESTED_PAK_SHA256 and \
            sha256(new_js) != TESTED_RESULT_SHA256:
        raise Stop('The patched page differs from the one tested before '
                   'delivery. Nothing has been changed.')
    blob = gzip.compress(new_js, compresslevel=9, mtime=0)
    if gzip.decompress(blob) != new_js:
        raise Stop('The patched page did not survive compression. '
                   'Nothing has been changed.')
    changed = list(resources)
    changed[index] = (rid, blob)
    new_pak = write_pak(head, changed, aliases)
    head2, resources2, aliases2 = read_pak(new_pak)
    differing = [r for (r, b), (_, b0) in zip(resources2, resources) if b != b0]
    if (head2 != head or aliases2 != aliases or differing != [rid]
            or [r for r, _ in resources2] != [r for r, _ in resources]):
        raise Stop('The new resources.pak failed its own check. '
                   'Nothing has been changed.')
    return new_pak, rid

CSS = r'''#carriagePanelling {
  background:
      radial-gradient(130% 56% at 50% -6%, rgba(255, 186, 104, 0.13),
                      transparent 68%),
      repeating-linear-gradient(92deg, rgba(0, 0, 0, 0.22) 0 2px,
                                transparent 2px 9px),
      repeating-linear-gradient(88deg, rgba(255, 196, 140, 0.035) 0 1px,
                                transparent 1px 23px),
      linear-gradient(180deg, #170A06, #2C1309 48%, #120704);
  inset: 0;
  pointer-events: none;
  position: fixed;
  z-index: -1;
}

.carriage-brass-band {
  background: linear-gradient(90deg, #2A1F0C, #9A7F3C, #2A1F0C);
  height: 3px;
  left: 0;
  opacity: 0.75;
  position: absolute;
  right: 0;
}

.carriage-brass-band.top {
  top: 13%;
}

.carriage-brass-band.bottom {
  bottom: 13%;
}

#carriagePlate {
  background: linear-gradient(180deg, #D6BE7C, #8E7334);
  border-radius: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6), inset 0 1px 0 #F3E0A8;
  color: #241007;
  font-family: Copperplate, Futura, 'Avenir Next', sans-serif;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5em;
  margin-bottom: 44px;
  padding: 9px 26px 8px 34px;
}

#carriageScenery {
  height: 0;
  position: absolute;
  width: 0;
}

#carriageTrain {
  animation: carriage-sway 5.2s ease-in-out infinite;
  display: flex;
  gap: 46px;
  margin-bottom: 52px;
}

@keyframes carriage-sway {
  0%, 100% { transform: translateY(-0.8px) rotate(-0.05deg); }
  50% { transform: translateY(0.8px) rotate(0.05deg); }
}

.carriage-window {
  background: linear-gradient(160deg, #C4A75F, #5A4320);
  border-radius: 92px 92px 20px 20px;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.6),
              inset 0 1px 0 rgba(255, 238, 190, 0.45);
  box-sizing: border-box;
  height: 252px;
  padding: 8px;
  width: 184px;
}

.carriage-glass {
  border-radius: 86px 86px 13px 13px;
  box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.8);
  height: 100%;
  overflow: hidden;
  position: relative;
  width: 100%;
}

.carriage-scene {
  display: block;
  height: 100%;
  position: static;
  width: 100%;
}

.scene-sky {
  fill: url(#carriageNight);
}

.scene-stars {
  fill: url(#carriageStars);
}

.star-small {
  stroke: #FFF6DE;
  stroke-linecap: round;
  stroke-opacity: 0.55;
  stroke-width: 1.1;
}

.star-large {
  stroke: #FFF8E8;
  stroke-linecap: round;
  stroke-opacity: 0.85;
  stroke-width: 1.9;
}

.moon {
  fill: #FBF2D4;
}

.moon-glow {
  fill: url(#carriageMoonGlow);
}

.hills {
  fill: #0E1730;
}

.woods {
  fill: #070C18;
}

.cottage-light {
  fill: #FFC773;
  fill-opacity: 0.85;
}

.pole {
  fill: #05080F;
}

.wire {
  fill: none;
  stroke: #05080F;
  stroke-width: 1.1;
}

.hedge {
  fill: #02040A;
}

.scene-hills {
  animation: carriage-roll-hills 190s linear infinite;
  fill: url(#carriageHills);
}

.scene-woods {
  animation: carriage-roll-woods 48s linear infinite;
  fill: url(#carriageWoods);
}

.scene-poles {
  animation: carriage-roll-poles 16s linear infinite;
  fill: url(#carriagePoles);
}

.scene-hedge {
  animation: carriage-roll-hedge 5.5s linear infinite;
  fill: url(#carriageHedge);
}

@keyframes carriage-roll-hills {
  to { transform: translateX(-900px); }
}

@keyframes carriage-roll-woods {
  to { transform: translateX(-620px); }
}

@keyframes carriage-roll-poles {
  to { transform: translateX(-340px); }
}

@keyframes carriage-roll-hedge {
  to { transform: translateX(-170px); }
}

.carriage-shutter {
  animation: carriage-rattle 0.9s ease-in-out infinite;
  animation-delay: var(--rattle);
  height: var(--drop);
  left: -8%;
  position: absolute;
  top: -2px;
  transform: rotate(var(--tilt));
  transform-origin: 50% 0;
  width: 116%;
}

.carriage-slats {
  background:
      repeating-linear-gradient(180deg,
                                rgba(78, 51, 28, 0.86) 0 3.4px,
                                rgba(132, 95, 51, 0.8) 3.4px 4.2px,
                                rgba(10, 7, 4, 0.22) 4.2px 5.6px);
  box-shadow: 0 4px 9px rgba(0, 0, 0, 0.45);
  height: 100%;
  opacity: 0.94;
}

.carriage-rail {
  background: linear-gradient(180deg, #8C7239, #43351A);
  bottom: -3px;
  height: 4px;
  left: 0;
  position: absolute;
  right: 0;
}

.carriage-cord {
  background: rgba(232, 209, 154, 0.45);
  height: 9px;
  left: 52%;
  position: absolute;
  top: 4px;
  width: 1px;
}

.carriage-cord::after {
  border: 1px solid rgba(232, 209, 154, 0.5);
  border-radius: 50%;
  content: '';
  height: 3px;
  left: -2px;
  position: absolute;
  top: 8px;
  width: 3px;
}

@keyframes carriage-rattle {
  0%, 100% { transform: rotate(var(--tilt)) translateY(-0.35px); }
  50% { transform: rotate(calc(var(--tilt) + 0.12deg)) translateY(0.4px); }
}

.carriage-reflection {
  background:
      radial-gradient(64px 40px at 27% 16%, rgba(255, 201, 126, 0.16),
                      transparent 74%),
      linear-gradient(116deg, transparent 0 39%,
                      rgba(255, 234, 196, 0.045) 44% 51%, transparent 57%),
      linear-gradient(0deg, rgba(255, 186, 116, 0.08), transparent 30%);
  border-radius: inherit;
  inset: 0;
  pointer-events: none;
  position: absolute;
}

@media (max-width: 1180px) {
  #carriageTrain { zoom: 0.84; }
}

@media (max-width: 1000px) {
  #carriageTrain { zoom: 0.7; }
}

@media (max-width: 840px) {
  #carriageTrain { zoom: 0.56; }
}

@media (prefers-reduced-motion: reduce) {
  #carriageTrain,
  .carriage-shutter,
  .scene-hills,
  .scene-woods,
  .scene-poles,
  .scene-hedge {
    animation: none;
  }
}

#carriageHall {
  align-items: center;
  display: flex;
  flex-direction: column;
}

.rail-scene,
.plate-rail {
  display: none;
}

.scene-rail .rail-scene {
  display: block;
}

.scene-rail .plate-rail {
  display: inline;
}
'''

HTML = r'''<div id="carriagePanelling" aria-hidden="true">
    <div class="carriage-brass-band top"></div>
    <div class="carriage-brass-band bottom"></div>
  </div>
  <div id="carriageHall" class="scene-rail">
    <div id="carriagePlate" aria-hidden="true">
      <span class="plate-rail">CARRIAGE</span>
    </div>
    <svg id="carriageScenery" aria-hidden="true">
      <defs>
        <linearGradient id="carriageNight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#04060D"></stop>
          <stop offset=".46" stop-color="#080E20"></stop>
          <stop offset=".70" stop-color="#101A38"></stop>
          <stop offset=".80" stop-color="#1A2347"></stop>
          <stop offset=".88" stop-color="#2B2644"></stop>
          <stop offset="1" stop-color="#140E1C"></stop>
        </linearGradient>
        <radialGradient id="carriageMoonGlow" cx=".5" cy=".5" r=".5">
          <stop offset=".3" stop-color="#FFF3D0" stop-opacity=".30"></stop>
          <stop offset="1" stop-color="#FFF3D0" stop-opacity="0"></stop>
        </radialGradient>
        <pattern id="carriageStars" width="430" height="236"
            patternUnits="userSpaceOnUse">
          <path class="star-small" d="M21.6 38.7h0M49.3 57.9h0M54.9 55.9h0M61.7 114.1h0M75.4 34.7h0M84.5 27.2h0M117.8 66.4h0M122.3 56.2h0M130.6 82.8h0M141.8 22.6h0M151.0 22.8h0M167.3 76.6h0M169.3 6.5h0M178.1 57.1h0M178.8 64.3h0M212.2 103.4h0M217.2 113.6h0M230.9 40.9h0M250.1 101.3h0M251.8 60.8h0M258.6 85.0h0M287.9 63.1h0M309.4 29.8h0M311.9 17.1h0M329.1 109.6h0M348.2 82.0h0M367.6 54.8h0M369.3 67.7h0M379.5 40.0h0M408.4 81.1h0M419.9 104.1h0M420.4 62.5h0"></path>
          <path class="star-large" d="M111.1 9.3h0M188.1 66.0h0"></path>
        </pattern>
        <pattern id="carriageHills" width="900" height="236"
            patternUnits="userSpaceOnUse">
          <path class="hills" d="M0 170C90 151 150 195 240 182S380 141 470 164S640 197 740 172S862 153 900 170L900 236L0 236Z"></path>
        </pattern>
        <pattern id="carriageWoods" width="620" height="236"
            patternUnits="userSpaceOnUse">
          <path class="woods" d="M4.2 198.0L12.0 170.0L19.8 198.0ZM17.9 198.0L25.0 180.7L32.2 198.0ZM38.6 198.0L43.5 168.2L48.4 198.0ZM54.8 198.0L62.0 172.8L69.1 198.0ZM70.1 198.0L77.6 176.2L85.1 198.0ZM88.7 198.0L95.1 174.9L101.5 198.0ZM108.0 198.0L113.8 164.1L119.5 198.0ZM120.9 198.0L128.0 181.8L135.1 198.0ZM137.9 198.0L145.2 165.1L152.4 198.0ZM152.9 198.0L160.7 179.0L168.4 198.0ZM170.1 198.0L175.0 177.4L180.0 198.0ZM188.1 198.0L192.9 164.6L197.7 198.0ZM202.0 198.0L209.3 165.8L216.7 198.0ZM219.5 198.0L227.7 181.0L235.9 198.0ZM240.2 198.0L246.2 178.2L252.2 198.0ZM258.5 198.0L264.3 169.2L270.1 198.0ZM273.7 198.0L281.7 180.1L289.6 198.0ZM286.7 198.0L294.3 179.9L301.8 198.0ZM299.2 198.0L307.2 165.0L315.1 198.0ZM320.6 198.0L325.3 170.2L329.9 198.0ZM331.9 198.0L337.4 164.1L342.8 198.0ZM348.3 198.0L355.2 179.4L362.1 198.0ZM366.2 198.0L373.8 169.8L381.5 198.0ZM380.1 198.0L387.4 168.0L394.6 198.0ZM393.1 198.0L398.2 177.2L403.2 198.0ZM406.3 198.0L412.6 172.6L418.9 198.0ZM424.4 198.0L430.6 178.1L436.8 198.0ZM437.0 198.0L444.5 171.5L451.9 198.0ZM450.1 198.0L457.4 175.5L464.7 198.0ZM468.0 198.0L476.3 168.2L484.7 198.0ZM479.1 198.0L486.9 176.2L494.7 198.0ZM495.2 198.0L503.3 168.5L511.3 198.0ZM506.5 198.0L514.4 177.5L522.2 198.0ZM525.0 198.0L531.1 179.4L537.3 198.0ZM543.2 198.0L549.9 179.0L556.6 198.0ZM559.1 198.0L565.7 164.8L572.3 198.0ZM569.4 198.0L576.8 178.1L584.2 198.0ZM582.2 198.0L588.4 166.8L594.5 198.0ZM597.7 198.0L605.5 175.1L613.4 198.0Z"></path>
          <path class="woods" d="M384 198v-21l15-12 15 12v21Z"></path>
          <path class="cottage-light" d="M390 182h7v7h-7ZM403 182h7v7h-7Z"></path>
        </pattern>
        <pattern id="carriagePoles" width="340" height="236"
            patternUnits="userSpaceOnUse">
          <path class="wire" d="M0 120C60 118 120 108 170 106C220 108 280 118 340 120"></path>
          <path class="wire" d="M0 127C60 125 120 115 170 113C220 115 280 125 340 127"></path>
          <path class="pole" d="M168.5 104h3v98h-3ZM157 101h26v3h-26Z"></path>
        </pattern>
        <pattern id="carriageHedge" width="170" height="236"
            patternUnits="userSpaceOnUse">
          <path class="hedge" d="M0 216L13.5 208.3L24.7 209.3L35.1 218.4L48.2 216.9L62.1 209.5L69.2 211.9L78.0 209.4L87.3 218.8L99.1 209.1L108.6 210.7L118.3 209.6L128.2 219.8L140.6 216.6L149.2 215.7L162.1 206.9L170 216L170 236L0 236Z"></path>
        </pattern>
      </defs>
    </svg>
    <div id="carriageTrain" aria-hidden="true">
      <div class="carriage-window">
        <div class="carriage-glass">
          <svg class="carriage-scene rail-scene" viewBox="0 0 168 236"
              preserveAspectRatio="none">
            <rect class="scene-sky" x="0" y="0" width="920" height="236"></rect>
            <rect class="scene-stars" x="0" y="0" width="920" height="236"></rect>
            <circle class="moon-glow" cx="774" cy="52" r="46"></circle>
            <circle class="moon" cx="774" cy="52" r="15"></circle>
            <rect class="scene-hills" x="-900" y="0" width="2720" height="236"></rect>
            <rect class="scene-woods" x="-620" y="0" width="2160" height="236"></rect>
            <rect class="scene-poles" x="-340" y="0" width="1600" height="236"></rect>
            <rect class="scene-hedge" x="-170" y="0" width="1260" height="236"></rect>
          </svg>
          <div class="carriage-shutter"
              style="--drop: 34%; --tilt: -0.95deg; --rattle: -0.15s">
            <div class="carriage-slats"></div>
            <div class="carriage-rail"><span class="carriage-cord"></span></div>
          </div>
          <div class="carriage-reflection"></div>
        </div>
      </div>
      <div class="carriage-window">
        <div class="carriage-glass">
          <svg class="carriage-scene rail-scene" viewBox="230 0 168 236"
              preserveAspectRatio="none">
            <rect class="scene-sky" x="0" y="0" width="920" height="236"></rect>
            <rect class="scene-stars" x="0" y="0" width="920" height="236"></rect>
            <circle class="moon-glow" cx="774" cy="52" r="46"></circle>
            <circle class="moon" cx="774" cy="52" r="15"></circle>
            <rect class="scene-hills" x="-900" y="0" width="2720" height="236"></rect>
            <rect class="scene-woods" x="-620" y="0" width="2160" height="236"></rect>
            <rect class="scene-poles" x="-340" y="0" width="1600" height="236"></rect>
            <rect class="scene-hedge" x="-170" y="0" width="1260" height="236"></rect>
          </svg>
          <div class="carriage-shutter"
              style="--drop: 45%; --tilt: 0.9deg; --rattle: -0.8s">
            <div class="carriage-slats"></div>
            <div class="carriage-rail"><span class="carriage-cord"></span></div>
          </div>
          <div class="carriage-reflection"></div>
        </div>
      </div>
      <div class="carriage-window">
        <div class="carriage-glass">
          <svg class="carriage-scene rail-scene" viewBox="460 0 168 236"
              preserveAspectRatio="none">
            <rect class="scene-sky" x="0" y="0" width="920" height="236"></rect>
            <rect class="scene-stars" x="0" y="0" width="920" height="236"></rect>
            <circle class="moon-glow" cx="774" cy="52" r="46"></circle>
            <circle class="moon" cx="774" cy="52" r="15"></circle>
            <rect class="scene-hills" x="-900" y="0" width="2720" height="236"></rect>
            <rect class="scene-woods" x="-620" y="0" width="2160" height="236"></rect>
            <rect class="scene-poles" x="-340" y="0" width="1600" height="236"></rect>
            <rect class="scene-hedge" x="-170" y="0" width="1260" height="236"></rect>
          </svg>
          <div class="carriage-shutter"
              style="--drop: 58%; --tilt: 0.8deg; --rattle: -0.62s">
            <div class="carriage-slats"></div>
            <div class="carriage-rail"><span class="carriage-cord"></span></div>
          </div>
          <div class="carriage-reflection"></div>
        </div>
      </div>
      <div class="carriage-window">
        <div class="carriage-glass">
          <svg class="carriage-scene rail-scene" viewBox="690 0 168 236"
              preserveAspectRatio="none">
            <rect class="scene-sky" x="0" y="0" width="920" height="236"></rect>
            <rect class="scene-stars" x="0" y="0" width="920" height="236"></rect>
            <circle class="moon-glow" cx="774" cy="52" r="46"></circle>
            <circle class="moon" cx="774" cy="52" r="15"></circle>
            <rect class="scene-hills" x="-900" y="0" width="2720" height="236"></rect>
            <rect class="scene-woods" x="-620" y="0" width="2160" height="236"></rect>
            <rect class="scene-poles" x="-340" y="0" width="1600" height="236"></rect>
            <rect class="scene-hedge" x="-170" y="0" width="1260" height="236"></rect>
          </svg>
          <div class="carriage-reflection"></div>
        </div>
      </div>
    </div>
  </div>
  '''

if __name__ == '__main__':
    import sys
    pak=Path(sys.argv[1])
    original=pak.read_bytes()
    result,rid=build_new_pak(original)
    if result is None:
        print('Night train is already installed')
    else:
        pak.write_bytes(result)
        print(f'Updated only new-tab resource {rid}; {len(original)} -> {len(result)} bytes')

