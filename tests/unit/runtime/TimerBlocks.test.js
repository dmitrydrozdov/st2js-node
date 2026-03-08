'use strict';

const { TON, TOF, TP, RS, SR, CTU, CTD, CTUD } = require('../../../src/runtime/TimerBlocks');

describe('TimerBlocks', () => {
  describe('TON (Timer On-Delay)', () => {
    test('Q=false when IN=false', () => {
      const ton = new TON();
      ton.call(false, 1000);
      expect(ton.Q).toBe(false);
      expect(ton.ET).toBe(0);
    });

    test('Q=true after PT elapsed', () => {
      const ton = new TON();
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      ton.call(true, 100);
      expect(ton.Q).toBe(false);

      Date.now.mockReturnValue(now + 100);
      ton.call(true, 100);
      expect(ton.Q).toBe(true);

      Date.now.mockRestore();
    });

    test('ET tracks elapsed time', () => {
      const ton = new TON();
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      ton.call(true, 1000);

      Date.now.mockReturnValue(now + 500);
      ton.call(true, 1000);
      expect(ton.ET).toBe(500);

      Date.now.mockRestore();
    });

    test('resets when IN goes false', () => {
      const ton = new TON();
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      ton.call(true, 100);
      Date.now.mockReturnValue(now + 200);
      ton.call(true, 100);
      expect(ton.Q).toBe(true);

      ton.call(false, 100);
      expect(ton.Q).toBe(false);
      expect(ton.ET).toBe(0);

      Date.now.mockRestore();
    });
  });

  describe('TOF (Timer Off-Delay)', () => {
    test('Q=true while IN=true', () => {
      const tof = new TOF();
      tof.call(true, 1000);
      expect(tof.Q).toBe(true);
    });

    test('Q stays true then goes false after PT after IN goes false', () => {
      const tof = new TOF();
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      tof.call(true, 100);
      expect(tof.Q).toBe(true);

      Date.now.mockReturnValue(now + 10);
      tof.call(false, 100);
      expect(tof.Q).toBe(true);

      Date.now.mockReturnValue(now + 110);
      tof.call(false, 100);
      expect(tof.Q).toBe(false);

      Date.now.mockRestore();
    });
  });

  describe('TP (Timer Pulse)', () => {
    test('Q=true for PT after rising edge', () => {
      const tp = new TP();
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      tp.call(true, 100);
      expect(tp.Q).toBe(true);

      Date.now.mockReturnValue(now + 50);
      tp.call(true, 100);
      expect(tp.Q).toBe(true);

      Date.now.mockReturnValue(now + 100);
      tp.call(true, 100);
      expect(tp.Q).toBe(false);

      Date.now.mockRestore();
    });

    test('re-trigger does nothing during pulse', () => {
      const tp = new TP();
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      tp.call(true, 100);
      expect(tp.Q).toBe(true);

      // Simulate falling then rising edge during pulse
      Date.now.mockReturnValue(now + 30);
      tp.call(false, 100);
      Date.now.mockReturnValue(now + 40);
      tp.call(true, 100);

      // Still in original pulse, Q should be true and timer unchanged
      Date.now.mockReturnValue(now + 50);
      tp.call(true, 100);
      expect(tp.Q).toBe(true);

      Date.now.mockRestore();
    });
  });

  describe('RS (Reset-dominant latch)', () => {
    test('SET=true, RESET=false -> Q1=true', () => {
      const rs = new RS();
      rs.call(true, false);
      expect(rs.Q1).toBe(true);
    });

    test('SET=true, RESET=true -> Q1=false (reset dominant)', () => {
      const rs = new RS();
      rs.call(true, true);
      expect(rs.Q1).toBe(false);
    });

    test('latching behavior', () => {
      const rs = new RS();
      rs.call(true, false);
      expect(rs.Q1).toBe(true);
      rs.call(false, false);
      expect(rs.Q1).toBe(true);
      rs.call(false, true);
      expect(rs.Q1).toBe(false);
    });
  });

  describe('SR (Set-dominant latch)', () => {
    test('SET1=true, RESET=true -> Q1=true (set dominant)', () => {
      const sr = new SR();
      sr.call(true, true);
      expect(sr.Q1).toBe(true);
    });

    test('SET1=false, RESET=true -> Q1=false', () => {
      const sr = new SR();
      sr.call(false, true);
      expect(sr.Q1).toBe(false);
    });

    test('latching behavior', () => {
      const sr = new SR();
      sr.call(true, false);
      expect(sr.Q1).toBe(true);
      sr.call(false, false);
      expect(sr.Q1).toBe(true);
      sr.call(false, true);
      expect(sr.Q1).toBe(false);
    });
  });

  describe('CTU (Counter Up)', () => {
    test('counts up on rising edge of CU', () => {
      const ctu = new CTU();
      ctu.call(true, false, 5);
      expect(ctu.CV).toBe(1);
      ctu.call(false, false, 5);
      ctu.call(true, false, 5);
      expect(ctu.CV).toBe(2);
    });

    test('Q=true when CV>=PV', () => {
      const ctu = new CTU();
      for (let i = 0; i < 5; i++) {
        ctu.call(true, false, 5);
        ctu.call(false, false, 5);
      }
      expect(ctu.CV).toBe(5);
      expect(ctu.Q).toBe(true);
    });

    test('RESET clears CV', () => {
      const ctu = new CTU();
      ctu.call(true, false, 5);
      ctu.call(false, false, 5);
      ctu.call(true, false, 5);
      expect(ctu.CV).toBe(2);
      ctu.call(false, true, 5);
      expect(ctu.CV).toBe(0);
      expect(ctu.Q).toBe(false);
    });
  });

  describe('CTD (Counter Down)', () => {
    test('counts down on rising edge of CD', () => {
      const ctd = new CTD();
      ctd.call(false, true, 5); // LOAD
      expect(ctd.CV).toBe(5);

      ctd.call(true, false, 5);
      expect(ctd.CV).toBe(4);
      ctd.call(false, false, 5);
      ctd.call(true, false, 5);
      expect(ctd.CV).toBe(3);
    });

    test('Q=true when CV<=0', () => {
      const ctd = new CTD();
      ctd.call(false, true, 2); // LOAD with PV=2
      for (let i = 0; i < 2; i++) {
        ctd.call(true, false, 2);
        ctd.call(false, false, 2);
      }
      expect(ctd.CV).toBe(0);
      expect(ctd.Q).toBe(true);
    });
  });

  describe('CTUD (Counter Up/Down)', () => {
    test('counts up and down', () => {
      const ctud = new CTUD();
      ctud.call(true, false, false, false, 10);
      expect(ctud.CV).toBe(1);
      ctud.call(false, false, false, false, 10);
      ctud.call(false, true, false, false, 10);
      expect(ctud.CV).toBe(0);
    });

    test('RESET clears', () => {
      const ctud = new CTUD();
      ctud.call(true, false, false, false, 10);
      ctud.call(false, false, false, false, 10);
      ctud.call(true, false, false, false, 10);
      expect(ctud.CV).toBe(2);
      ctud.call(false, false, true, false, 10);
      expect(ctud.CV).toBe(0);
    });
  });
});
