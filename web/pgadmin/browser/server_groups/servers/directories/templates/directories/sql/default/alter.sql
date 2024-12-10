{### SQL to alter directory ###}
{% if data %}
{### Owner on directory ###}
{% if data.spcuser %}
ALTER DIRECTORY {{ conn|qtIdent(data.name) }}
  OWNER TO {{ conn|qtIdent(data.spcuser) }};

{% endif %}
{### Comments on directory ###}
{% if data.description %}
COMMENT ON DIRECTORY {{ conn|qtIdent(data.name) }}
  IS {{ data.description|qtLiteral(conn) }};

{% endif %}
{% endif %}

{# ======== The SQl Below will fetch id for given dataspace ======== #}
{% if directory %}
SELECT dir.oid FROM pg_catalog.edb_dir dir WHERE dirname = {{directory|qtLiteral(conn)}};
{% endif %}