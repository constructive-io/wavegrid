import { beyondIniCandidates, checkBeyond, findBeyondIni, parseIni, readBeyondSettings } from '../src/beyond';

const INI = [
  '; BEYOND configuration',
  '[General]',
  'ShowRGBAPanel=0',
  'Language=English',
  '',
  '[OSC]',
  'Enable=1',
  'PortIn=8000',
  'PortOut=8001'
].join('\r\n');

describe('parseIni', () => {
  it('reads sections and keys case-insensitively, ignoring comments', () => {
    const ini = parseIni(INI);
    expect(ini.general.showrgbapanel).toBe('0');
    expect(ini.osc.portin).toBe('8000');
    expect(ini.general.language).toBe('English');
  });

  it('ignores lines that are not key=value', () => {
    expect(parseIni('[OSC]\nnonsense\n=5\nPortIn=9000').osc).toEqual({ portin: '9000' });
  });
});

describe('readBeyondSettings', () => {
  it('extracts the OSC port, enable flag and RGBA panel', () => {
    expect(readBeyondSettings(INI)).toEqual({ oscEnabled: true, oscPort: 8000, showRgbaPanel: false });
  });

  it('leaves unknown settings undefined rather than guessing', () => {
    expect(readBeyondSettings('[General]\n')).toEqual({
      oscEnabled: undefined,
      oscPort: undefined,
      showRgbaPanel: undefined
    });
  });
});

describe('beyondIniCandidates', () => {
  it('honours an explicit override', () => {
    expect(beyondIniCandidates({ WAVEGRID_BEYOND_INI: 'C:\\tmp\\BEYOND.ini' })).toEqual(['C:\\tmp\\BEYOND.ini']);
  });

  it('looks under the Windows data dirs otherwise', () => {
    const found = beyondIniCandidates({ PROGRAMDATA: 'C:\\ProgramData' });
    expect(found).toEqual(['C:\\ProgramData\\Pangolin\\BEYOND\\BEYOND.ini']);
  });

  it('produces nothing off Windows, so the check is skipped', () => {
    expect(beyondIniCandidates({})).toEqual([]);
  });
});

describe('findBeyondIni', () => {
  it('returns the first existing candidate', () => {
    const env = { PROGRAMDATA: 'C:\\ProgramData', APPDATA: 'C:\\Users\\x\\AppData\\Roaming' };
    const appdata = 'C:\\Users\\x\\AppData\\Roaming\\Pangolin\\BEYOND\\BEYOND.ini';
    expect(findBeyondIni(env, (p) => p === appdata)).toBe(appdata);
    expect(findBeyondIni(env, () => false)).toBeNull();
  });
});

describe('checkBeyond', () => {
  it('fails when wavegrid sends to a port BEYOND is not receiving on', () => {
    const [check] = checkBeyond({ oscEnabled: true, oscPort: 8000 }, 7001);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('sends to :7001');
    expect(check.remedy).toContain('--port 8000');
  });

  it('passes when the ports agree', () => {
    expect(checkBeyond({ oscEnabled: true, oscPort: 8000 }, 8000)[0].status).toBe('pass');
  });

  it('fails when BEYOND has OSC switched off', () => {
    const checks = checkBeyond({ oscEnabled: false, oscPort: 8000 }, 8000);
    expect(checks[0]).toMatchObject({ name: 'BEYOND OSC', status: 'fail' });
    expect(checks[0].detail).toContain('disabled');
  });

  it('flags ShowRGBAPanel=0, which mutes the livecontrol colour addresses', () => {
    const checks = checkBeyond({ oscEnabled: true, oscPort: 8000, showRgbaPanel: false }, 8000);
    const rgba = checks.find((c) => c.name === 'BEYOND RGBA panel');
    expect(rgba?.status).toBe('fail');
    expect(rgba?.remedy).toContain('ShowRGBAPanel=1');
  });

  it('says nothing when the settings are unknown', () => {
    expect(checkBeyond({}, 8000)).toEqual([]);
  });
});
