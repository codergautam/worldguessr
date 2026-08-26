// ChinaGuessr (temporary): pins the measured facts about Baidu's panorama
// endpoints so a refactor cannot silently shift the tile grid or the id
// detection the results screens rely on.
import { describe, it, expect, vi } from 'vitest';
import { tileUrl, parseSdata, buildBaiduNav, isBaiduPanoId, centerBearingDeg, fetchSdata } from '../components/china/baidu.js';

const ID = '09024200121707301421572809B';
const HK_CONTENT = {
  ID,
  X: 1271067694,
  Y: 253083902,
  Heading: 218.26,
  LayerCount: 4,
  Rname: '梳士巴利道',
  Date: '20170730',
  Type: 'street',
  Obsolete: 0,
  UserID: '',
  DeviceHeight: 2.32,
  Links: [
    { PID: '09024200121707301421597839B', RID: 'road-west', X: 1271066953, Y: 253083547, DIR: 268 },
    { PID: '09024200121707301421544569B', RID: 'road-east', X: 1271068133, Y: 253084893, DIR: 7 },
  ],
  Roads: [
    { ID: 'road-west', Name: '梳士巴利道', Panos: null },
    { ID: 'road-east', Name: '梳士巴利道', Panos: null },
  ],
};

describe('baidu tile addressing', () => {
  it('renderer z0 is Baidu z=1 and pos is row_col', () => {
    expect(tileUrl(ID, 0, 0, 0)).toBe(`https://mapsv1.bdimg.com/?qt=pdata&sid=${ID}&pos=0_0&z=1`);
    expect(tileUrl(ID, 4, 15, 7)).toBe(`https://mapsv1.bdimg.com/?qt=pdata&sid=${ID}&pos=7_15&z=5`);
  });
});

describe('parseSdata', () => {
  it('reads the fields the game needs and scales X/Y to metres', () => {
    const m = parseSdata({ content: [HK_CONTENT], result: { error: 0 } });
    expect(m).toMatchObject({
      id: ID,
      x: 12710676.94,
      y: 2530839.02,
      heading: 218.26,
      maxZ: 4,
      street: '梳士巴利道',
      type: 'street',
      obsolete: false,
      userUploaded: false,
      height: 2.32,
      links: [
        { id: '09024200121707301421597839B', roadId: 'road-west', x: 12710669.53, y: 2530835.47 },
        { id: '09024200121707301421544569B', roadId: 'road-east', x: 12710681.33, y: 2530848.93 },
      ],
    });
  });
  it('is null on a miss', () => {
    expect(parseSdata({ result: { error: 404 } })).toBeNull();
    expect(parseSdata(null)).toBeNull();
  });
});

describe('buildBaiduNav', () => {
  it('computes the measured HK link bearings and distances from X/Y', () => {
    const nav = buildBaiduNav(parseSdata({ content: [HK_CONTENT] }));
    expect(nav.height).toBe(2.32);
    const west = nav.links.find((link) => link.id === '09024200121707301421597839B');
    const east = nav.links.find((link) => link.id === '09024200121707301421544569B');
    expect(nav.links).toHaveLength(2);
    expect(west).toMatchObject({ road: '梳士巴利道' });
    expect(west.bearing).toBeCloseTo(244.4, 1);
    expect(west.dist).toBeCloseTo(8.2, 1);
    expect(east.bearing).toBeCloseTo(23.9, 1);
    expect(east.dist).toBeCloseTo(10.8, 1);
  });

  // Links[] is empty for most panos: the road chain supplies the arrows.
  it('adds the chain neighbours on each side as arrows when Links is empty', () => {
    const panos = [];
    for (let i = 0; i < 6; i++) panos.push({ id: i === 3 ? ID : `p${i}`, x: 0, y: i * 20 });
    const nav = buildBaiduNav({
      id: ID, x: 0, y: 60, height: 2.3, links: [],
      roads: [{ id: 'road', name: '方岳路', panos }],
    });
    expect(nav.links.map((link) => link.id).sort()).toEqual(['p2', 'p4']);
    const ahead = nav.links.find((link) => link.id === 'p4');
    expect(ahead).toMatchObject({ bearing: 0, dist: 20, road: '方岳路' });
    expect(nav.links.find((link) => link.id === 'p2').bearing).toBe(180);
  });

  it('merges a junction link and a chain neighbour that share a bearing, keeping the nearer', () => {
    const panos = [{ id: ID, x: 0, y: 0 }, { id: 'chain', x: 0, y: 25 }];
    const nav = buildBaiduNav({
      id: ID, x: 0, y: 0, height: 2.3,
      links: [{ id: 'junction', roadId: 'other', x: 1, y: 12 }],
      roads: [{ id: 'road', name: 'Road', panos }, { id: 'other', name: 'Other', panos: [] }],
    });
    expect(nav.links).toHaveLength(1);
    expect(nav.links[0]).toMatchObject({ id: 'junction', road: 'Other' });
  });

  it('falls back to the nearest chain pano on each side when the chain omits the current pano', () => {
    const panos = [{ id: 'a', x: 0, y: -30 }, { id: 'b', x: 0, y: -10 }, { id: 'c', x: 0, y: 15 }, { id: 'd', x: 0, y: 40 }];
    const nav = buildBaiduNav({
      id: ID, x: 0, y: 0, height: 2.3, links: [],
      roads: [{ id: 'road', name: 'Road', panos }],
    });
    expect(nav.links.map((link) => link.id).sort()).toEqual(['b', 'c']);
  });

  it('keeps only the 40 nearest deduplicated road candidates', () => {
    const panos = [{ id: ID, x: 0, y: 0 }];
    for (let i = 50; i >= 1; i--) panos.push({ id: `p${i}`, x: i, y: 0 });
    panos.push({ id: 'p1', x: 100, y: 0 });
    const nav = buildBaiduNav({
      id: ID,
      x: 0,
      y: 0,
      height: 2.3,
      links: [],
      roads: [{ id: 'road', name: 'Road', panos }],
    });
    expect(nav.candidates).toHaveLength(40);
    expect(nav.candidates[0].id).toBe('p1');
    expect(nav.candidates[39].id).toBe('p40');
  });
});

describe('isBaiduPanoId', () => {
  it('accepts Baidu ids and rejects Google ids', () => {
    expect(isBaiduPanoId(ID)).toBe(true);
    expect(isBaiduPanoId('0901590012230702193530670AS')).toBe(true);
    expect(isBaiduPanoId('mKVPI-EbVtbt-yAFw7g58w')).toBe(false);
    expect(isBaiduPanoId('CAoSLEFGMVFpcE5fZ3ZJUUlpWU9')).toBe(false);
    expect(isBaiduPanoId(null)).toBe(false);
  });
});

describe('centerBearingDeg', () => {
  it('is Heading - 90, wrapped', () => {
    expect(centerBearingDeg(218.26)).toBeCloseTo(128.26);
    expect(centerBearingDeg(45)).toBe(315);
  });
});

describe('fetchSdata', () => {
  it('shares one request per id and forgets a failed one', async () => {
    const calls = [];
    globalThis.fetch = vi.fn((url) => {
      calls.push(url);
      if (calls.length === 1) return Promise.reject(new Error('down'));
      return Promise.resolve({ json: () => Promise.resolve({ ok: calls.length }) });
    });
    await expect(fetchSdata('first')).rejects.toThrow('down');
    await Promise.resolve();
    const a = fetchSdata('first');
    const b = fetchSdata('first');
    expect(a).toBe(b);
    expect(await a).toEqual({ ok: 2 });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('qt=sdata&pc=1&sid=first');
  });
});
