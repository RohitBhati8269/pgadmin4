

import json
import re
from functools import wraps

from pgadmin.browser.server_groups import servers
from flask import render_template, request, jsonify, current_app
from flask_babel import gettext
from pgadmin.browser.collection import CollectionNodeModule
from pgadmin.browser.server_groups.servers.utils import parse_priv_from_db, \
    parse_priv_to_db
from pgadmin.browser.utils import PGChildNodeView
from pgadmin.utils.ajax import make_json_response, \
    make_response as ajax_response, internal_server_error, gone
from pgadmin.utils.ajax import precondition_required
from pgadmin.utils.driver import get_driver
from config import PG_DEFAULT_DRIVER


class DirectoryModule(CollectionNodeModule):
    """
    Module for managing directories.
    """
    _NODE_TYPE = 'directory'
    _COLLECTION_LABEL = gettext("Directories")

    def __init__(self, import_name, **kwargs):
        super().__init__(import_name, **kwargs)

    def get_nodes(self, gid, sid):
        """
        Generate the collection node
        """
        yield self.generate_browser_collection_node(sid)

    @property
    def script_load(self):
        """
        Load the module script for server, when any of the server-group node is
        initialized.
        """
        return servers.ServerModule.node_type

    @property
    def module_use_template_javascript(self):
        """
        Returns whether Jinja2 template is used for generating the javascript
        module.
        """
        return False

    @property
    def node_inode(self):
        return False

# Register the module as a Blueprint
blueprint = DirectoryModule(__name__)

class DirectoryView(PGChildNodeView):
    node_type = blueprint.node_type

    parent_ids = [
        {'type': 'int', 'id': 'gid'},
        {'type': 'int', 'id': 'sid'}
    ]
    ids = [
        {'type': 'int', 'id': 'drid'}
    ]

    operations = dict({
        'obj': [
            {'get': 'properties', 'delete': 'delete', 'put': 'update'},
            {'get': 'list', 'post': 'create', 'delete': 'delete'}
        ],
        'nodes': [{'get': 'node'}, {'get': 'nodes'}],
        'children': [{'get': 'children'}],
        'sql': [{'get': 'sql'}],
        'msql': [{'get': 'msql'}, {'get': 'msql'}],
        'stats': [{'get': 'statistics'}, {'get': 'statistics'}],
        'dependency': [{'get': 'dependencies'}],
        'dependent': [{'get': 'dependents'}],
        # 'vopts': [{}, {'get': 'variable_options'}],
        # 'move_objects': [{'put': 'move_objects'}],
        # 'move_objects_sql': [{'get': 'move_objects_sql'}],
    })

    def check_precondition(f):
        """
        This function will behave as a decorator which will checks
        database connection before running view, it will also attaches
        manager,conn & template_path properties to self
        """

        @wraps(f)
        def wrap(*args, **kwargs):
            # Here args[0] will hold self & kwargs will hold gid,sid,drid
            self = args[0]
            self.manager = get_driver(
                PG_DEFAULT_DRIVER
            ).connection_manager(
                kwargs['sid']
            )
            self.conn = self.manager.connection()
            self.datistemplate = False
            if (
                self.manager.db_info is not None and
                self.manager.did in self.manager.db_info and
                'datistemplate' in self.manager.db_info[self.manager.did]
            ):
                self.datistemplate = self.manager.db_info[
                    self.manager.did]['datistemplate']

            # If DB not connected then return error to browser
            if not self.conn.connected():
                current_app.logger.warning(
                    "Connection to the server has been lost."
                )
                return precondition_required(
                    gettext(
                        "Connection to the server has been lost."
                    )
                )

            self.template_path = 'directories/sql/#{0}#'.format(
                self.manager.version
            )
            current_app.logger.debug(
                "Using the template path: %s", self.template_path
            )
            # Allowed ACL on directory
            self.acl = ['C']

            return f(*args, **kwargs)

        return wrap

    @check_precondition
    def list(self, gid, sid):
        SQL = render_template(
            "/".join([self.template_path, self._PROPERTIES_SQL]),
            conn=self.conn
        )
        status, res = self.conn.execute_dict(SQL)

        if not status:
            return internal_server_error(errormsg=res)
        return ajax_response(
            response=res['rows'],
            status=200
        )

    @check_precondition
    def node(self, gid, sid, drid):
        SQL = render_template(
            "/".join([self.template_path, self._NODES_SQL]),
            drid=drid, conn=self.conn
        )
        status, rset = self.conn.execute_2darray(SQL)
        if not status:
            return internal_server_error(errormsg=rset)

        if len(rset['rows']) == 0:
            return gone(gettext("""Could not find the directory."""))

        res = self.blueprint.generate_browser_node(
            rset['rows'][0]['oid'],
            sid,
            rset['rows'][0]['name'],
            icon="icon-directory"
        )

        return make_json_response(
            data=res,
            status=200
        )

    @check_precondition
    def nodes(self, gid, sid, drid=None):
        res = []
        SQL = render_template(
            "/".join([self.template_path, self._NODES_SQL]),
            drid=drid, conn=self.conn
        )
        status, rset = self.conn.execute_2darray(SQL)
        if not status:
            return internal_server_error(errormsg=rset)

        for row in rset['rows']:
            res.append(
                self.blueprint.generate_browser_node(
                    row['oid'],
                    sid,
                    row['name'],
                    icon="icon-directory",
                    description=row['description']
                ))

        return make_json_response(
            data=res,
            status=200
        )

    def _formatter(self, data, drid=None):
        """
        Args:
            data: dict of query result
            drid: directory oid

        Returns:
            It will return formatted output of collections
        """
        # We need to format variables according to client js collection
        if 'spcoptions' in data and data['spcoptions'] is not None:
            spcoptions = []
            for spcoption in data['spcoptions']:
                k, v = spcoption.split('=')
                spcoptions.append({'name': k, 'value': v})

            data['spcoptions'] = spcoptions

        # Need to format security labels according to client js collection
        if 'seclabels' in data and data['seclabels'] is not None:
            seclabels = []
            for seclbls in data['seclabels']:
                k, v = seclbls.split('=')
                seclabels.append({'provider': k, 'label': v})

            data['seclabels'] = seclabels

        # We need to parse & convert ACL coming from database to json format
        SQL = render_template(
            "/".join([self.template_path, self._ACL_SQL]),
            drid=drid, conn=self.conn
        )
        status, acl = self.conn.execute_dict(SQL)
        if not status:
            return internal_server_error(errormsg=acl)

        # We will set get privileges from acl sql so we don't need
        # it from properties sql
        data['spcacl'] = []

        for row in acl['rows']:
            priv = parse_priv_from_db(row)
            if row['deftype'] in data:
                data[row['deftype']].append(priv)
            else:
                data[row['deftype']] = [priv]

        return data

    @check_precondition
    def properties(self, gid, sid, drid):
        SQL = render_template(
            "/".join([self.template_path, self._PROPERTIES_SQL]),
            drid=drid, conn=self.conn
        )
        status, res = self.conn.execute_dict(SQL)
        if not status:
            return internal_server_error(errormsg=res)

        if len(res['rows']) == 0:
            return gone(
                gettext("""Could not find the directory information.""")
            )

        # Making copy of output for future use
        copy_data = dict(res['rows'][0])
        copy_data['is_sys_obj'] = (
            copy_data['oid'] <= self._DATABASE_LAST_SYSTEM_OID or
            self.datistemplate)
        copy_data = self._formatter(copy_data, drid)

        return ajax_response(
            response=copy_data,
            status=200
        )

    @check_precondition
    def create(self, gid, sid):
        """
        This function will creates new the directory object
        """

        required_args = {
            'name': 'Name',
            'spclocation': 'Location'
        }

        data = request.form if request.form else json.loads(
            request.data
        )

        for arg in required_args:
            if arg not in data:
                return make_json_response(
                    status=410,
                    success=0,
                    errormsg=gettext(
                        "Could not find the required parameter ({})."
                    ).format(arg)
                )

        # To format privileges coming from client
        if 'spcacl' in data:
            data['spcacl'] = parse_priv_to_db(data['spcacl'], ['C'])

        try:
            SQL = render_template(
                "/".join([self.template_path, self._CREATE_SQL]),
                data=data, conn=self.conn
            )

            status, res = self.conn.execute_scalar(SQL)

            if not status:
                return internal_server_error(errormsg=res)

            # To fetch the oid of newly created directory
            SQL = render_template(
                "/".join([self.template_path, self._ALTER_SQL]),
                directory=data['name'], conn=self.conn
            )

            status, drid = self.conn.execute_scalar(SQL)

            if not status:
                return internal_server_error(errormsg=drid)

            SQL = render_template(
                "/".join([self.template_path, self._ALTER_SQL]),
                data=data, conn=self.conn
            )

            # Checking if we are not executing empty query
            if SQL and SQL.strip('\n') and SQL.strip(' '):
                status, res = self.conn.execute_scalar(SQL)
                if not status:
                    return jsonify(
                        node=self.blueprint.generate_browser_node(
                            drid,
                            sid,
                            data['name'],
                            icon="icon-directory"
                        ),
                        success=0,
                        errormsg=gettext(
                            'Directory created successfully, '
                            'Set parameter fail: {0}'.format(res)
                        ),
                        info=gettext(
                            res
                        )
                    )

            other_node_info = {}
            if 'description' in data:
                other_node_info['description'] = data['description']

            return jsonify(
                node=self.blueprint.generate_browser_node(
                    drid,
                    sid,
                    data['name'],
                    icon="icon-directory",
                    **other_node_info
                )
            )
        except Exception as e:
            current_app.logger.exception(e)
            return internal_server_error(errormsg=str(e))

    @check_precondition
    def update(self, gid, sid, drid):
        """
        This function will update directory object
        """
        data = request.form if request.form else json.loads(
            request.data
        )

        try:
            SQL, name = self.get_sql(gid, sid, data, drid)
            # Most probably this is due to error
            if not isinstance(SQL, str):
                return SQL

            SQL = SQL.strip('\n').strip(' ')
            status, res = self.conn.execute_scalar(SQL)
            if not status:
                return internal_server_error(errormsg=res)

            other_node_info = {}
            if 'description' in data:
                other_node_info['description'] = data['description']

            return jsonify(
                node=self.blueprint.generate_browser_node(
                    drid,
                    sid,
                    name,
                    icon="icon-%s" % self.node_type,
                    **other_node_info
                )
            )
        except Exception as e:
            current_app.logger.exception(e)
            return internal_server_error(errormsg=str(e))

    @check_precondition
    def delete(self, gid, sid, drid=None):
        """
        This function will drop the directory object
        """
        if drid is None:
            data = request.form if request.form else json.loads(
                request.data
            )
        else:
            data = {'ids': [drid]}

        try:
            for drid in data['ids']:
                SQL = render_template(
                        "/".join([self.template_path, self._NODES_SQL]),
                        drid=drid, conn=self.conn
                )
                # Get name for directory from drid
                status, rset = self.conn.execute_dict(SQL)

                if not status:
                    return internal_server_error(errormsg=rset)

                if not rset['rows']:
                    return make_json_response(
                        success=0,
                        errormsg=gettext(
                            'Error: Object not found.'
                        ),
                        info=gettext(
                            'The specified directory could not be found.\n'
                        )
                    )

                # drop directory
                SQL = render_template(
                    "/".join([self.template_path, self._DELETE_SQL]),
                    drname=(rset['rows'][0])['name'], conn=self.conn
                )

                status, res = self.conn.execute_scalar(SQL)
                if not status:
                    return internal_server_error(errormsg=res)

            return make_json_response(
                success=1,
                info=gettext("Directory dropped")
            )

        except Exception as e:
            current_app.logger.exception(e)
            return internal_server_error(errormsg=str(e))

    @check_precondition
    def msql(self, gid, sid, drid=None):
        """
        This function to return modified SQL
        """
        data = dict()
        for k, v in request.args.items():
            try:
                # comments should be taken as is because if user enters a
                # json comment it is parsed by loads which should not happen
                if k in ('description',):
                    data[k] = v
                else:
                    data[k] = json.loads(v)
            except ValueError as ve:
                current_app.logger.exception(ve)
                data[k] = v

        sql, _ = self.get_sql(gid, sid, data, drid)
        # Most probably this is due to error
        if not isinstance(sql, str):
            return sql

        sql = sql.strip('\n').strip(' ')
        if sql == '':
            sql = "--modified SQL"
        return make_json_response(
            data=sql,
            status=200
        )

    def _format_privilege_data(self, data):
        for key in ['spcacl']:
            if key in data and data[key] is not None:
                if 'added' in data[key]:
                    data[key]['added'] = parse_priv_to_db(
                        data[key]['added'], self.acl
                    )
                if 'changed' in data[key]:
                    data[key]['changed'] = parse_priv_to_db(
                        data[key]['changed'], self.acl
                    )
                if 'deleted' in data[key]:
                    data[key]['deleted'] = parse_priv_to_db(
                        data[key]['deleted'], self.acl
                    )

    def get_sql(self, gid, sid, data, drid=None):
        """
        This function will generate sql from model/properties data
        """
        required_args = [
            'name'
        ]

        if drid is not None:
            SQL = render_template(
                "/".join([self.template_path, self._PROPERTIES_SQL]),
                drid=drid, conn=self.conn
            )
            status, res = self.conn.execute_dict(SQL)
            if not status:
                return internal_server_error(errormsg=res)

            if len(res['rows']) == 0:
                return gone(
                    gettext("Could not find the directory on the server.")
                )

            # Making copy of output for further processing
            old_data = dict(res['rows'][0])
            old_data = self._formatter(old_data, drid)

            # To format privileges data coming from client
            self._format_privilege_data(data)

            # If name is not present with in update data then copy it
            # from old data
            for arg in required_args:
                if arg not in data:
                    data[arg] = old_data[arg]

            SQL = render_template(
                "/".join([self.template_path, self._UPDATE_SQL]),
                data=data, o_data=old_data, conn=self.conn
            )
        else:
            # To format privileges coming from client
            if 'spcacl' in data:
                data['spcacl'] = parse_priv_to_db(data['spcacl'], self.acl)
            # If the request for new object which do not have drid
            SQL = render_template(
                "/".join([self.template_path, self._CREATE_SQL]),
                data=data, conn=self.conn
            )
            SQL += "\n"
            SQL += render_template(
                "/".join([self.template_path, self._ALTER_SQL]),
                data=data, conn=self.conn
            )
        SQL = re.sub('\n{2,}', '\n\n', SQL)
        return SQL, data['name'] if 'name' in data else old_data['name']

    @check_precondition
    def sql(self, gid, sid, drid):
        """
        This function will generate sql for sql panel
        """
        SQL = render_template(
            "/".join([self.template_path, self._PROPERTIES_SQL]),
            drid=drid, conn=self.conn
        )
        status, res = self.conn.execute_dict(SQL)
        if not status:
            return internal_server_error(errormsg=res)

        if len(res['rows']) == 0:
            return gone(
                gettext("Could not find the directory on the server.")
            )
        # Making copy of output for future use
        old_data = dict(res['rows'][0])

        old_data = self._formatter(old_data, drid)

        # To format privileges
        if 'spcacl' in old_data:
            old_data['spcacl'] = parse_priv_to_db(old_data['spcacl'], self.acl)

        SQL = ''
        # We are not showing create sql for system directory
        if not old_data['name'].startswith('pg_'):
            SQL = render_template(
                "/".join([self.template_path, self._CREATE_SQL]),
                data=old_data
            )
            SQL += "\n"
        SQL += render_template(
            "/".join([self.template_path, self._ALTER_SQL]),
            data=old_data, conn=self.conn
        )

        sql_header = """
-- Directory: {0}

-- DROP TABLESPACE IF EXISTS {0};

""".format(old_data['name'])

        SQL = sql_header + SQL
        SQL = re.sub('\n{2,}', '\n\n', SQL)
        return ajax_response(response=SQL.strip('\n'))

    # @check_precondition
    # def variable_options(self, gid, sid):
    #     """
    #     Args:
    #         gid:
    #         sid:

    #     Returns:
    #         This function will return list of variables available for
    #         table spaces.
    #     """
    #     ver = self.manager.version
    #     if ver >= 90600:
    #         SQL = render_template(
    #             "/".join(['directorys/sql/default', 'variables.sql'])
    #         )
    #     else:
    #         SQL = render_template(
    #             "/".join([self.template_path, 'variables.sql'])
    #         )
    #     status, rset = self.conn.execute_dict(SQL)

    #     if not status:
    #         return internal_server_error(errormsg=rset)

    #     return make_json_response(
    #         data=rset['rows'],
    #         status=200
    #     )

    @check_precondition
    def statistics(self, gid, sid, drid=None):
        """
        This function will return data for statistics panel
        """
        SQL = render_template(
            "/".join([self.template_path, 'stats.sql']),
            drid=drid, conn=self.conn
        )
        status, res = self.conn.execute_dict(SQL)

        if not status:
            return internal_server_error(errormsg=res)

        return make_json_response(
            data=res,
            status=200
        )

    @check_precondition
    def dependencies(self, gid, sid, drid):
        """
        This function gets the dependencies and returns an ajax response
        for the directory.

        Args:
            gid: Server Group ID
            sid: Server ID
            drid: Directory ID
        """
        dependencies_result = self.get_dependencies(self.conn, drid)
        return ajax_response(
            response=dependencies_result,
            status=200
        )

    @check_precondition
    def dependents(self, gid, sid, drid):
        """
        This function gets the dependents and returns an ajax response
        for the directory.

        Args:
            gid: Server Group ID
            sid: Server ID
            drid: Directory ID
        """
        dependents_result = self.get_dependents(self.conn, sid, drid)
        return ajax_response(
            response=dependents_result,
            status=200
        )

    def _handel_dependents_type(self, types, type_str, row, rel_name):
        type_name = ''
        if types[type_str[0]] is None:
            if type_str[0] == 'i':
                type_name = 'index'
                rel_name = row['indname'] + ' ON ' + rel_name
            elif type_str[0] == 'o':
                type_name = 'operator'
                rel_name = row['relname']
        else:
            type_name = types[type_str[0]]
        return type_name, rel_name

    def _check_dependents_type(self, types, dependents, db_row, result):
        for row in result['rows']:
            rel_name = row['nspname']
            if rel_name is not None:
                rel_name += '.'

            if rel_name is None:
                rel_name = row['relname']
            else:
                rel_name += row['relname']

            type_str = row['relkind']
            # Fetch the type name from the dictionary
            # if type is not present in the types dictionary then
            # we will continue and not going to add it.
            if type_str[0] in types:
                # if type is present in the types dictionary, but it's
                # value is None then it requires special handling.
                type_name, rel_name = self._handel_dependents_type(types,
                                                                   type_str,
                                                                   row,
                                                                   rel_name)
            else:
                continue

            dependents.append(
                {
                    'type': type_name,
                    'name': rel_name,
                    'field': db_row['datname']
                }
            )

    def _create_dependents_data(self, types, result, dependents, db_row,
                                is_connected, manager):

        self._check_dependents_type(types, dependents, db_row, result)

        # Release only those connections which we have created above.
        if not is_connected:
            manager.release(db_row['datname'])

    def get_dependents(self, conn, sid, drid):
        """
        This function is used to fetch the dependents for the selected node.

        Args:
            conn: Connection object
            sid: Server Id
            drid: Directory ID

        Returns: Dictionary of dependents for the selected node.
        """
        # Dictionary for the object types
        types = {
            # None specified special handling for this type
            'r': 'table',
            'i': None,
            'S': 'sequence',
            'v': 'view',
            'x': 'external_table',
            'p': 'function',
            'n': 'schema',
            'y': 'type',
            'd': 'domain',
            'T': 'trigger_function',
            'C': 'conversion',
            'o': None
        }

        # Fetching databases with CONNECT privileges status.
        query = render_template(
            "/".join([self.template_path, 'dependents.sql']),
            fetch_database=True
        )
        status, db_result = self.conn.execute_dict(query)
        if not status:
            current_app.logger.error(db_result)

        dependents = list()

        # Get the server manager
        manager = get_driver(PG_DEFAULT_DRIVER).connection_manager(sid)

        for db_row in db_result['rows']:
            oid = db_row['datdirectory']

            # Append all the databases to the dependents list if oid is same
            if drid == oid:
                dependents.append({
                    'type': 'database', 'name': '', 'field': db_row['datname']
                })

            # If connection to the database is not allowed then continue
            # with the next database
            if not db_row['datallowconn']:
                continue

            # Get the connection from the manager for the specified database.
            # Check the connect status and if it is not connected then create
            # a new connection to run the query and fetch the dependents.
            is_connected = True
            try:
                temp_conn = manager.connection(database=db_row['datname'])
                is_connected = temp_conn.connected()
                if not is_connected:
                    temp_conn.connect()
            except Exception as e:
                current_app.logger.exception(e)

            if temp_conn.connected():
                query = render_template(
                    "/".join([self.template_path, 'dependents.sql']),
                    fetch_dependents=True, drid=drid
                )
                status, result = temp_conn.execute_dict(query)
                if not status:
                    current_app.logger.error(result)

                self._create_dependents_data(types, result, dependents, db_row,
                                             is_connected, manager)

        return dependents

# Register the view with the blueprint
DirectoryView.register_node_view(blueprint)
