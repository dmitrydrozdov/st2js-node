'use strict';

/**
 * @fileoverview IEC 61131-3 standard timer and counter function blocks.
 */

// ─── TON: Timer On-Delay ─────────────────────────────────────────────────────

class TON {
  constructor() {
    this.IN = false;
    this.PT = 0;
    this.Q = false;
    this.ET = 0;
    this._startTime = null;
  }

  call(IN, PT) {
    this.IN = IN;
    this.PT = PT;
    const now = Date.now();
    if (IN) {
      if (this._startTime === null) this._startTime = now;
      this.ET = Math.min(now - this._startTime, PT);
      this.Q = this.ET >= PT;
    } else {
      this._startTime = null;
      this.ET = 0;
      this.Q = false;
    }
  }
}

// ─── TOF: Timer Off-Delay ────────────────────────────────────────────────────

class TOF {
  constructor() {
    this.IN = false;
    this.PT = 0;
    this.Q = false;
    this.ET = 0;
    this._startTime = null;
    this._prevIN = false;
  }

  call(IN, PT) {
    this.IN = IN;
    this.PT = PT;
    const now = Date.now();
    if (IN) {
      this.Q = true;
      this.ET = 0;
      this._startTime = null;
    } else {
      // Falling edge: IN went from true to false
      if (this._prevIN && !IN) {
        this._startTime = now;
      }
      if (this._startTime !== null) {
        this.ET = Math.min(now - this._startTime, PT);
        this.Q = this.ET < PT;
        if (this.ET >= PT) {
          this._startTime = null;
        }
      } else {
        this.Q = false;
        this.ET = 0;
      }
    }
    this._prevIN = IN;
  }
}

// ─── TP: Timer Pulse ─────────────────────────────────────────────────────────

class TP {
  constructor() {
    this.IN = false;
    this.PT = 0;
    this.Q = false;
    this.ET = 0;
    this._startTime = null;
    this._prevIN = false;
  }

  call(IN, PT) {
    this.IN = IN;
    this.PT = PT;
    const now = Date.now();
    // Rising edge starts the pulse
    if (IN && !this._prevIN && this._startTime === null) {
      this._startTime = now;
    }
    if (this._startTime !== null) {
      this.ET = Math.min(now - this._startTime, PT);
      this.Q = this.ET < PT;
      if (this.ET >= PT) {
        this._startTime = null;
      }
    } else {
      this.Q = false;
      this.ET = 0;
    }
    this._prevIN = IN;
  }
}

// ─── RS: Reset-Set Latch (reset-dominant) ────────────────────────────────────

class RS {
  constructor() {
    this.SET = false;
    this.RESET1 = false;
    this.Q1 = false;
  }

  call(SET, RESET1) {
    this.SET = SET;
    this.RESET1 = RESET1;
    // Reset-dominant: if both SET and RESET are true, output is false
    this.Q1 = !RESET1 && (SET || this.Q1);
  }
}

// ─── SR: Set-Reset Latch (set-dominant) ──────────────────────────────────────

class SR {
  constructor() {
    this.SET1 = false;
    this.RESET = false;
    this.Q1 = false;
  }

  call(SET1, RESET) {
    this.SET1 = SET1;
    this.RESET = RESET;
    // Set-dominant: if both SET and RESET are true, output is true
    this.Q1 = SET1 || (!RESET && this.Q1);
  }
}

// ─── CTU: Counter Up ─────────────────────────────────────────────────────────

class CTU {
  constructor() {
    this.CU = false;
    this.RESET = false;
    this.PV = 0;
    this.Q = false;
    this.CV = 0;
    this._prevCU = false;
  }

  call(CU, RESET, PV) {
    this.CU = CU;
    this.RESET = RESET;
    this.PV = PV;
    if (RESET) {
      this.CV = 0;
    } else if (CU && !this._prevCU) {
      // Rising edge on CU
      this.CV = (this.CV + 1) | 0;
    }
    this.Q = this.CV >= PV;
    this._prevCU = CU;
  }
}

// ─── CTD: Counter Down ───────────────────────────────────────────────────────

class CTD {
  constructor() {
    this.CD = false;
    this.LOAD = false;
    this.PV = 0;
    this.Q = false;
    this.CV = 0;
    this._prevCD = false;
  }

  call(CD, LOAD, PV) {
    this.CD = CD;
    this.LOAD = LOAD;
    this.PV = PV;
    if (LOAD) {
      this.CV = PV;
    } else if (CD && !this._prevCD) {
      // Rising edge on CD
      this.CV = (this.CV - 1) | 0;
    }
    this.Q = this.CV <= 0;
    this._prevCD = CD;
  }
}

// ─── CTUD: Counter Up/Down ───────────────────────────────────────────────────

class CTUD {
  constructor() {
    this.CU = false;
    this.CD = false;
    this.RESET = false;
    this.LOAD = false;
    this.PV = 0;
    this.QU = false;
    this.QD = false;
    this.CV = 0;
    this._prevCU = false;
    this._prevCD = false;
  }

  call(CU, CD, RESET, LOAD, PV) {
    this.CU = CU;
    this.CD = CD;
    this.RESET = RESET;
    this.LOAD = LOAD;
    this.PV = PV;
    if (RESET) {
      this.CV = 0;
    } else if (LOAD) {
      this.CV = PV;
    } else {
      if (CU && !this._prevCU) {
        this.CV = (this.CV + 1) | 0;
      }
      if (CD && !this._prevCD) {
        this.CV = (this.CV - 1) | 0;
      }
    }
    this.QU = this.CV >= PV;
    this.QD = this.CV <= 0;
    this._prevCU = CU;
    this._prevCD = CD;
  }
}

module.exports = { TON, TOF, TP, RS, SR, CTU, CTD, CTUD };
