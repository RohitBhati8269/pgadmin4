{### SQL to fetch directory object properties ###}
SELECT
    dir.oid, 
    dirname AS name, 
    pg_catalog.pg_get_userbyid(dirowner) as diruser,
    dirpath AS path,
    pg_catalog.array_to_string(diracl::text[], ', ') as acl,
    pg_catalog.shobj_description(oid, 'pg_directory') AS description,
    (SELECT
        pg_catalog.array_agg(provider || '=' || label)
    FROM pg_catalog.pg_shseclabel sl1
    WHERE sl1.objoid=dir.oid) AS seclabels
FROM
    pg_catalog.edb_dir dir
{% if drid %}
WHERE dir.oid={{ drid|qtLiteral(conn) }}::OID
{% endif %}
ORDER BY name;

