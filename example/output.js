'use strict';
const { TON, TOF, TP, RS, SR, CTU, CTD } = require("/Users/dmitriid/Documents/code_ext_test_1/st2js/src/runtime/TimerBlocks");


class CounterWithTimer {
  constructor() {
    this.Timer = new TON(); // TON
    this.Sum = 0; // INT
    this.i = 0; // INT
    this.Count = 0; // INT
    this.Done = false; // BOOL
    this.TimedOut = false; // BOOL
  }

  call(Enable, Reset, MaxCount, PresetTime) {
    // ST line 28
    if (Reset) {
      // ST line 29
      this.Count = (0) | 0;
      // ST line 30
      this.Done = false;
      // ST line 31
      this.TimedOut = false;
    } else if (Enable) {
      // ST line 34
      this.Timer.call(Enable, PresetTime);
      // ST line 35
      this.TimedOut = this.Timer.Q;
      // ST line 38
      if ((this.Count < MaxCount)) {
        // ST line 39
        this.Count = ((this.Count + 1)) | 0;
      } else {
        // ST line 41
        this.Done = true;
      }
      // ST line 45
      this.Sum = (0) | 0;
      // ST line 46
      for (this.i = (1) | 0; this.i <= (this.Count) | 0; this.i = (this.i + 1) | 0) {
        // ST line 47
        this.Sum = ((this.Sum + this.i)) | 0;
      }
    }
  }
}

function TriangleNumber(N) {
  let _result = 0; // return value (DINT)
  let i = 0; // INT
  let result = 0; // DINT
  // ST line 61
  result = (0) | 0;
  // ST line 62
  for (i = (1) | 0; i <= (N) | 0; i = (i + 1) | 0) {
    // ST line 63
    result = ((result + i)) | 0;
  }
  // ST line 65
  _result = (result) | 0;
  return _result;
}

// Program: Main
let FB1 = new CounterWithTimer(); // CounterWithTimer
let Cycles = 0; // INT
let TotalSum = 0; // DINT

function run() {
  // ST line 77
  switch (Cycles) {
    case 0:
      // ST line 79
      FB1.call(true, false, 5, 500);
      break;
    case 1:
    case 2:
    case 3:
      // ST line 81
      FB1.call(true, false);
      break;
    case 4:
      // ST line 83
      FB1.call(false, true);
      break;
    default:
      // ST line 85
      FB1.call(false, false);
      break;
  }
  // ST line 88
  if (FB1.Done) {
    // ST line 89
    TotalSum = (TriangleNumber(FB1.Count)) | 0;
  }
  // ST line 92
  Cycles = ((Cycles + 1)) | 0;
}

module.exports = { run, get FB1() { return FB1; }, get Cycles() { return Cycles; }, get TotalSum() { return TotalSum; } };

