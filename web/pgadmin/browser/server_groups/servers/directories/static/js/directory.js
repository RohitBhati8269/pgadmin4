/////////////////////////////////////////////////////////////
//
// pgAdmin 4 - PostgreSQL Tools
//
// Copyright (C) 2013 - 2024, The pgAdmin Development Team
// This software is released under the PostgreSQL Licence
//
//////////////////////////////////////////////////////////////

import { getNodeListByName } from '../../../../../static/js/node_ajax';
import { getNodePrivilegeRoleSchema } from '../../../static/js/privilege.ui';
import { getNodeVariableSchema } from '../../../static/js/variable.ui';
import DirectorySchema from './directory.ui';

define('pgadmin.node.directory', [
  'sources/gettext', 'sources/url_for',
  'pgadmin.browser', 'pgadmin.browser.collection',
], function(
  gettext, url_for, pgBrowser
) {

  if (!pgBrowser.Nodes['coll-directory']) {
    pgBrowser.Nodes['coll-directory'] =
      pgBrowser.Collection.extend({
        node: 'directory',
        label: gettext('Directries'),
        type: 'coll-directory',
        columns: ['name', 'spcuser', 'description'],
        hasStatistics: true,
        statsPrettifyFields: [gettext('Size')],
        canDrop: true,
        canDropCascade: false,
      });
  }
  console.log(pgBrowser.Nodes)
  if (!pgBrowser.Nodes['directory']) {
    pgBrowser.Nodes['directory'] = pgBrowser.Node.extend({
      parent_type: 'server',
      type: 'directory',
      sqlAlterHelp: 'sql-alterdirectory.html',
      sqlCreateHelp: 'sql-createdirectory.html',
      dialogHelp: url_for('help.static', {'filename': 'directory_dialog.html'}),
      label: gettext('Directory'),
      hasSQL:  true,
      canDrop: true,
      hasDepends: true,
      hasStatistics: true,
      statsPrettifyFields: [gettext('Size')],
      Init: function() {
        /* Avoid multiple registration of menus */
        if (this.initialized)
          return;

        this.initialized = true;

        pgBrowser.add_menus([{
          name: 'create_directory_on_server', node: 'server', module: this,
          applies: ['object', 'context'], callback: 'show_obj_properties',
          category: 'create', priority: 4, label: gettext('Directory...1'),
          data: {action: 'create'},
          enable: 'can_create_directory',
        },{
          name: 'create_directory_on_coll', node: 'coll-directory', module: this,
          applies: ['object', 'context'], callback: 'show_obj_properties',
          category: 'create', priority: 4, label: gettext('Directory...2'),
          data: {action: 'create'},
          enable: 'can_create_directory',
        },{
          name: 'create_directory', node: 'directory', module: this,
          applies: ['object', 'context'], callback: 'show_obj_properties',
          category: 'create', priority: 4, label: gettext('Directory...3'),
          data: {action: 'create'},
          enable: 'can_create_directory',
        },
        ]);
      },
      can_create_directory: function(node, item) {
        let treeData = pgBrowser.tree.getTreeNodeHierarchy(item),
          server = treeData['server'];

        return server.connected && server.user.is_superuser;
      },
      callbacks: {
      },

      getSchema: function(treeNodeInfo, itemNodeData) {
        return new DirectorySchema(
          ()=>getNodeVariableSchema(this, treeNodeInfo, itemNodeData, false, false),
          (privileges)=>getNodePrivilegeRoleSchema(this, treeNodeInfo, itemNodeData, privileges),
          {
            role: ()=>getNodeListByName('role', treeNodeInfo, itemNodeData),
          },
          {
            spcuser: pgBrowser.serverInfo[treeNodeInfo.server._id].user.name,
          }
        );
      },
    });

  }

  return pgBrowser.Nodes['coll-directory'];
});
