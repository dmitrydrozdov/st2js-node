PROGRAM DataProcessor
  VAR
    maxVal: INT := 0;
    i: INT;
    val: INT;
  END_VAR

  maxVal := 0;
  FOR i := 1 TO 10 DO
    val := i * 3;
    IF val > maxVal THEN
      maxVal := val;
    END_IF
  END_FOR
END_PROGRAM
