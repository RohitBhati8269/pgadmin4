{### SQL to update directory object ###}
{% import 'macros/security.macros' as SECLABEL %}
{% import 'macros/variable.macros' as VARIABLE %}
{% import 'macros/privilege.macros' as PRIVILEGE %}
{% if data %}
{# ==== To update directory name ==== #}
{% if data.name and data.name != o_data.name %}
ALTER DIRECTORY {{ conn|qtIdent(o_data.name) }}
  RENAME TO {{ conn|qtIdent(data.name) }};

{% endif %}
{# ==== To update directory user ==== #}
{% if data.spcuser and data.spcuser != o_data.spcuser %}
ALTER DIRECTORY {{ conn|qtIdent(data.name) }}
  OWNER TO {{ conn|qtIdent(data.spcuser) }};

{% endif %}
{# ==== To update directory comments ==== #}
{% if data.description is defined and data.description != o_data.description %}
COMMENT ON DIRECTORY {{ conn|qtIdent(data.name) }}
  IS {{ data.description|qtLiteral(conn) }};

{% endif %}
{# ==== To update directory variables ==== #}
{% if 'spcoptions' in data and data.spcoptions|length > 0 %}
{% set variables = data.spcoptions %}
{% if 'deleted' in variables and variables.deleted|length > 0 %}
{{ VARIABLE.UNSET(conn, 'DIRECTORY', data.name, variables.deleted) }}
{% endif %}
{% if 'added' in variables and variables.added|length > 0 %}
{{ VARIABLE.SET(conn, 'DIRECTORY', data.name, variables.added) }}
{% endif %}
{% if 'changed' in variables and variables.changed|length > 0 %}
{{ VARIABLE.SET(conn, 'DIRECTORY', data.name, variables.changed) }}
{% endif %}

{% endif %}
{# ==== To update directory securitylabel ==== #}
{# The SQL generated below will change Security Label #}
{% if data.seclabels and data.seclabels|length > 0 %}
{% set seclabels = data.seclabels %}
{% if 'deleted' in seclabels and seclabels.deleted|length > 0 %}
{% for r in seclabels.deleted %}
{{ SECLABEL.DROP(conn, 'DIRECTORY', data.name, r.provider) }}
{% endfor %}
{% endif %}
{% if 'added' in seclabels and seclabels.added|length > 0 %}
{% for r in seclabels.added %}
{{ SECLABEL.APPLY(conn, 'DIRECTORY', data.name, r.provider, r.label) }}
{% endfor %}
{% endif %}
{% if 'changed' in seclabels and seclabels.changed|length > 0 %}
{% for r in seclabels.changed %}
{{ SECLABEL.APPLY(conn, 'DIRECTORY', data.name, r.provider, r.label) }}
{% endfor %}
{% endif %}

{% endif %}
{# ==== To update directory privileges ==== #}
{# Change the privileges #}
{% if data.spcacl %}
{% if 'deleted' in data.spcacl %}
{% for priv in data.spcacl.deleted %}
{{ PRIVILEGE.RESETALL(conn, 'DIRECTORY', priv.grantee, data.name) }}
{% endfor %}
{% endif %}
{% if 'changed' in data.spcacl %}
{% for priv in data.spcacl.changed %}
{{ PRIVILEGE.RESETALL(conn, 'DIRECTORY', priv.grantee, data.name) }}
{{ PRIVILEGE.APPLY(conn, 'DIRECTORY', priv.grantee, data.name, priv.without_grant, priv.with_grant) }}
{% endfor %}
{% endif %}
{% if 'added' in data.spcacl %}
{% for priv in data.spcacl.added %}
{{ PRIVILEGE.APPLY(conn, 'DIRECTORY', priv.grantee, data.name, priv.without_grant, priv.with_grant) }}
{% endfor %}
{% endif %}

{% endif %}
{% endif %}
