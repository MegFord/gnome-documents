/*
 * Copyright (c) 2011 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

const Global = imports.global;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const QueryColumns = {
    URN: 0,
    URI: 1,
    TITLE: 2,
    AUTHOR: 3,
    MTIME: 4,
    IDENTIFIER: 5,
    TYPE: 6,
    RESOURCE_URN: 7,
    FAVORITE: 8,
    SHARED: 9
};

function QueryBuilder() {
    this._init();
}

QueryBuilder.prototype = {
    _init: function() {
    },

    buildFilterLocal: function() {
        let path;
        let desktopURI;
        let documentsURI;

        path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
        if (path)
            desktopURI = Gio.file_new_for_path(path).get_uri();
        else
            desktopURI = '';

        path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS);
        if (path)
            documentsURI = Gio.file_new_for_path(path).get_uri();
        else
            documentsURI = '';

        let filter =
            ('((fn:starts-with (nie:url(?urn), "%s")) || ' +
             '(fn:starts-with (nie:url(?urn), "%s")))').format(desktopURI, documentsURI);

        return filter;
    },

    buildFilterNotLocal: function() {
        let filter =
            '(fn:contains(rdf:type(?urn), \"RemoteDataObject\"))';

        return filter;
    },

    _buildFilterSearch: function() {
        let filter =
            ('fn:contains ' +
             '(fn:lower-case (tracker:coalesce(nie:title(?urn), nfo:fileName(?urn))), ' +
             '"%s") ||' +
             'fn:contains ' +
             '(fn:lower-case (tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher))), ' +
             '"%s")').format(Global.filterController.getFilter(),
                             Global.filterController.getFilter());

        return filter;
    },

    _buildFilterString: function() {
        let sparql = 'FILTER (';

        sparql += '(' + this._buildFilterSearch() + ')';
        sparql += ' && ';
        sparql += '(' + Global.sourceManager.getActiveSourceFilter() + ')';
        sparql += ' && ';
        sparql += '(' + Global.categoryManager.getActiveCategoryFilter() + ')';

        sparql += ')';

        return sparql;
    },

    _buildTypeFilter: function() {
        let sparql =
            '{ ?urn a nfo:PaginatedTextDocument } ' +
            'UNION ' +
            '{ ?urn a nfo:Spreadsheet } ' +
            'UNION ' +
            '{ ?urn a nfo:Presentation } ';

        return sparql;
    },

    _buildOptional: function() {
        let sparql =
            'OPTIONAL { ?urn nco:creator ?creator . } ' +
            'OPTIONAL { ?urn nco:publisher ?publisher . } ';

        return sparql;
    },

    _buildQueryInternal: function(global) {
        let globalSparql =
            'WHERE { ' + this._buildOptional() + '}';

        if (global) {
            globalSparql =
                ('WHERE { ' +
                 this._buildTypeFilter() +
                 this._buildOptional() +
                 Global.categoryManager.getActiveCategoryWhere() +
                 this._buildFilterString() +
                 ' } ' +
                 'ORDER BY DESC (?mtime)' +
                 'LIMIT %d OFFSET %d').format(Global.offsetController.getOffsetStep(),
                                              Global.offsetController.getOffset());
        }

        let sparql =
            'SELECT DISTINCT ?urn ' + // urn
             'nie:url(?urn) ' + // uri
             'tracker:coalesce(nie:title(?urn), nfo:fileName(?urn)) ' + // title
             'tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher), \'\') ' + // author
             'tracker:coalesce(nfo:fileLastModified(?urn), nie:contentLastModified(?urn)) AS ?mtime ' + // mtime
             'nao:identifier(?urn) ' + // identifier
             'rdf:type(?urn) ' + // type
             'nie:dataSource(?urn) ' + // resource URN
             '( EXISTS { ?urn nao:hasTag nao:predefined-tag-favorite } ) ' + // favorite
             '( EXISTS { ?urn nco:contributor ?contributor FILTER ( ?contributor != ?creator ) } ) ' + // shared
             globalSparql;

        return sparql;
    },

    buildSingleQuery: function(resource) {
        let sparql = this._buildQueryInternal(false);
        return sparql.replace('?urn', '<' + resource + '>', 'g');
    },

    buildGlobalQuery: function() {
        return this._buildQueryInternal(true);
    },

    buildCountQuery: function() {
        let sparql =
            'SELECT DISTINCT COUNT(?urn) WHERE { ' +
            this._buildTypeFilter() +
            this._buildOptional() +
            this._buildFilterString() +
            '}';

        return sparql;
    }
};