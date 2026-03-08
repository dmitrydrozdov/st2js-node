PROGRAM TrafficLight
  VAR
    state: INT := 0;
    counter: INT := 0;
    redOn: BOOL := FALSE;
    yellowOn: BOOL := FALSE;
    greenOn: BOOL := FALSE;
  END_VAR

  counter := counter + 1;

  CASE state OF
    0:
      redOn := TRUE;
      yellowOn := FALSE;
      greenOn := FALSE;
      IF counter > 5 THEN
        state := 1;
        counter := 0;
      END_IF

    1:
      redOn := FALSE;
      yellowOn := FALSE;
      greenOn := TRUE;
      IF counter > 5 THEN
        state := 2;
        counter := 0;
      END_IF

    2:
      redOn := FALSE;
      yellowOn := TRUE;
      greenOn := FALSE;
      IF counter > 2 THEN
        state := 0;
        counter := 0;
      END_IF
  END_CASE
END_PROGRAM
