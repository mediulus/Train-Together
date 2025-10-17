Check file:///Users/megandiulus/Desktop/6.104/Assignment 4/Train-Together/src/concepts/TrainingRecords/TrainingRecordsConcept.test.ts
running 1 test from ./src/concepts/TrainingRecords/TrainingRecordsConcept.test.ts
TrainingRecords Concept Testing ...
  1. logData Action: Confirming 'requires' and 'effects' ...
    1.1. 'requires': all log values are valid keys ... ok (1ms)
    1.2. 'effects': logs new athlete data ... ok (90ms)
    1.3. 'effects': edits existing athlete data for the same day ... ok (90ms)
  1. logData Action: Confirming 'requires' and 'effects' ... ok (199ms)
  2. createWeeklySummary Action: Confirming 'requires' and 'effects' ...
    2.1. 'requires': no athlete data for the current week ... ok (15ms)
    2.2. 'effects': calculates correct week range and stores summary ... ok (115ms)
    2.3. 'effects': acquires data for current and previous weeks, calculates averages and trends ... ok (313ms)
  2. createWeeklySummary Action: Confirming 'requires' and 'effects' ... ok (477ms)
  3. Principle Fulfillment: Trace of actions to generate a weekly summary ... ok (565ms)
TrainingRecords Concept Testing ... ok (1s)

ok | 1 passed (9 steps) | 0 failed (1s)