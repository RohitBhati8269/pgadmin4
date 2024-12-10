{### SQL to delete tablespace object ###}
DROP DIRECTORY IF EXISTS {{ conn|qtIdent(tsname) }};
