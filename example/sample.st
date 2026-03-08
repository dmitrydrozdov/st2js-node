(* =============================================================
   sample.st - Non-trivial ST example: Counter with timer and reset
   Demonstrates: FUNCTION_BLOCK, VAR_INPUT, VAR_OUTPUT, VAR, IF,
                 standard TON timer, FOR loop, CASE statement
   ============================================================= *)

FUNCTION_BLOCK CounterWithTimer
  VAR_INPUT
    Enable  : BOOL;       (* Enable counting *)
    Reset   : BOOL;       (* Synchronous reset *)
    MaxCount: INT := 10;  (* Count limit *)
    PresetTime: TIME := T#1000ms; (* Timer preset *)
  END_VAR

  VAR_OUTPUT
    Count   : INT;        (* Current count value *)
    Done    : BOOL;       (* TRUE when MaxCount reached *)
    TimedOut: BOOL;       (* TRUE when timer expired *)
  END_VAR

  VAR
    Timer   : TON;        (* On-delay timer instance *)
    Sum     : INT;        (* Running sum for demo *)
    i       : INT;        (* Loop variable *)
  END_VAR

  (* Synchronous reset has highest priority *)
  IF Reset THEN
    Count    := 0;
    Done     := FALSE;
    TimedOut := FALSE;
  ELSIF Enable THEN
    (* Run timer *)
    Timer(IN := Enable, PT := PresetTime);
    TimedOut := Timer.Q;

    (* Increment counter if not done *)
    IF Count < MaxCount THEN
      Count := Count + 1;
    ELSE
      Done := TRUE;
    END_IF

    (* Calculate sum using FOR loop *)
    Sum := 0;
    FOR i := 1 TO Count DO
      Sum := Sum + i;
    END_FOR
  END_IF
END_FUNCTION_BLOCK


FUNCTION TriangleNumber: DINT
  VAR_INPUT
    N: INT;
  END_VAR
  VAR
    i: INT;
    result: DINT;
  END_VAR
  result := 0;
  FOR i := 1 TO N DO
    result := result + i;
  END_FOR
  TriangleNumber := result;
END_FUNCTION


PROGRAM Main
  VAR
    FB1     : CounterWithTimer;
    Cycles  : INT := 0;
    TotalSum: DINT;
  END_VAR

  (* Simulate 5 enable cycles *)
  CASE Cycles OF
    0:
      FB1(Enable := TRUE, Reset := FALSE, MaxCount := 5, PresetTime := T#500ms);
    1, 2, 3:
      FB1(Enable := TRUE, Reset := FALSE);
    4:
      FB1(Enable := FALSE, Reset := TRUE);
    ELSE
      FB1(Enable := FALSE, Reset := FALSE);
  END_CASE

  IF FB1.Done THEN
    TotalSum := TriangleNumber(N := FB1.Count);
  END_IF

  Cycles := Cycles + 1;
END_PROGRAM
