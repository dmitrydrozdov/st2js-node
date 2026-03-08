FUNCTION_BLOCK PID
  VAR_INPUT
    Setpoint: REAL;
    ProcessValue: REAL;
    Kp: REAL;
    Ki: REAL;
    Kd: REAL;
    DeltaT: REAL;
    Enable: BOOL;
  END_VAR
  VAR_OUTPUT
    Output: REAL;
  END_VAR
  VAR
    Integral: REAL;
    PreviousError: REAL;
    error: REAL;
    derivative: REAL;
  END_VAR

  IF Enable THEN
    error := Setpoint - ProcessValue;
    Integral := Integral + error * DeltaT;
    derivative := (error - PreviousError) / DeltaT;
    Output := Kp * error + Ki * Integral + Kd * derivative;
    PreviousError := error;
  ELSE
    Integral := 0.0;
    PreviousError := 0.0;
    Output := 0.0;
  END_IF
END_FUNCTION_BLOCK
