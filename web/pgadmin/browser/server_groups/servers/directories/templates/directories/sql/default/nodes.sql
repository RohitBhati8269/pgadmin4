SELECT
    dir.oid AS oid,
    dirname AS name,
    dirowner AS owner,
    dirpath AS path,
    pg_catalog.shobj_description(dir.oid, 'pg_directory') AS description
FROM
    pg_catalog.edb_dir dir
{% if drid %}
WHERE
    dir.oid={{ drid|qtLiteral(conn) }}::OID
{% endif %}
ORDER BY name;