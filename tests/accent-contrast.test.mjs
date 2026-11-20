import test from 'node:test';
import assert from 'node:assert/strict';
import * as website from '../public/assets/accent-colors.js';
import * as application from '../application/public/app/accent-colors.js';

// Independent WCAG reference calculation checks both browser module copies.
function ratio(first, second) {
  const luminance = color => {
    const channels = color.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
      .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const [a, b] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (a + .05) / (b + .05);
}
const accents = ['#000000', '#ffffff', '#ff242d', '#777777', '#0000ff', '#00ff00', '#ff00ff', '#ffff00', '#00ffff', '#123456', '#ac671d'];
for (const [name, module, isApplication] of [['website', website, false], ['application', application, true]]) {
  test(name + ' keeps accent fills and readable text/icons across themes', () => {
    for (const theme of ['dark', 'light', 'sport', 'cinema']) {
      for (const highContrast of [false, true]) for (const accent of accents) {
        const palette = module.accentPalette(accent, {theme, highContrast, application: isApplication});
        assert.equal(palette.accent, accent);
        assert.ok(ratio(palette.ink, accent) >= 4.5, `${theme}/${accent}: solid button label`);
        for (const surface of palette.surfaces) {
          assert.ok(ratio(palette.readable, surface) >= 4.5, `${theme}/${accent}: text/icon on ${surface}`);
        }
      }
    }
    assert.equal(module.accentPalette('#ffffff').ink, '#000000');
    assert.equal(module.accentPalette('#000000').ink, '#ffffff');
  });
  test(name + ' recalculates inherited colors when appearance changes', () => {
    const node = () => ({style: {values: new Map(), setProperty(key, value) {this.values.set(key, value);}}});
    const body = node(), documentElement = node();
    const doc = {body, documentElement, defaultView: {getComputedStyle() {
      return {getPropertyValue(key) {return key === '--bg' ? '#eef1f3' : '#fffffff0';}};
    }}};
    module.applyAccentColors(doc, '#ffffff', {theme: 'light', application: isApplication});
    for (const item of [body, documentElement]) {
      assert.equal(item.style.values.get('--accent'), '#ffffff');
      assert.equal(item.style.values.get('--accent-ink'), '#000000');
      assert.ok(ratio(item.style.values.get('--accent-readable'), '#ffffff') >= 4.5);
    }
    doc.defaultView.getComputedStyle = () => ({getPropertyValue(key) {return key === '--bg' ? '#0b1017' : '#101722';}});
    module.applyAccentColors(doc, '#000000', {application: isApplication});
    assert.equal(body.style.values.get('--accent-ink'), '#ffffff');
    assert.ok(ratio(body.style.values.get('--accent-readable'), '#101722') >= 4.5);
  });
}
test('contrast calculation matches known WCAG reference pairs', () => {
  for (const module of [website, application]) {
    assert.equal(module.contrastRatio('#000000', '#ffffff'), 21);
    assert.equal(module.contrastRatio('#fff', '#000'), 21);
    assert.ok(Math.abs(module.contrastRatio('#777777', '#ffffff') - 4.478089453577214) < 1e-9);
  }
});
