IF Value >= High THEN
  State := 2;
ELSIF Value >= Low THEN
  State := 1;
ELSE
  State := 0;
END_IF;
