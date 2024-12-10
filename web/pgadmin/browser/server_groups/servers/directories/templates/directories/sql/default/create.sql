{### SQL to create directory object ###}
{% if data %}
CREATE DIRECTORY {{ conn|qtIdent(data.name) }} AS {{ data.spclocation|qtLiteral(conn) }};
{% endif %}