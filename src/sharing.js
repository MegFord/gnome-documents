/*
 * Copyright(c) 2012 Meg Ford
 * Except for Line 530: 
 * JavaScript function to check an email address conforms to RFC822 (http://www.ietf.org/rfc/rfc0822.txt)
 *
 * Version: 0.2
 * Author: Ross Kendall
 * Created: 2006-12-16
 * Updated: 2007-03-22
 *
 * Based on the PHP code by Cal Henderson
 * http://iamcal.com/publish/articles/php/parsing_email/
 * Portions copyright (C) 2006  Ross Kendall - http://rosskendall.com
 * Portions copyright (C) 1993-2005 Cal Henderson - http://iamcal.com
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
 * Author: Meg Ford <megford@gnome.org>
 *
 */

const Clutter = imports.gi.Clutter;
const Gd = imports.gi.Gd;
const GdPrivate = imports.gi.GdPrivate;
const GData = imports.gi.GData;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const _ = imports.gettext.gettext;

const Documents = imports.documents;
const Global = imports.global;
const Manager = imports.manager;
const Query = imports.query;
const Selections = imports.selections;
const TrackerUtils = imports.trackerUtils;
const Utils = imports.utils;
const View = imports.view;

const Lang = imports.lang;
const Signals = imports.signals;

const SharingDialogColumns = {
    NAME: 0,
    ROLE: 1
};

const SharingDialog = new Lang.Class({
    Name: 'SharingDialog',

    _init: function() {
        let urn = Global.selectionController.getSelection();
        let doc = Global.documentManager.getItemById(urn);
        let rows = 0;

        this.identifier = doc.identifier;
        this.resourceUrn = doc.resourceUrn;
        this.feed = null;
        this.entry = null;
        this.docPrivate = "";
        this.pubEdit = false;
        let newPub = false;
        this.showTree = false;
        this._createGDataEntry();
        let toplevel = Global.application.get_windows()[0];

        this.widget = new Gtk.Dialog({ resizable: false,
                                       transient_for: toplevel,
                                       modal: true,
                                       destroy_with_parent: true,
                                       default_width: 100,
                                       default_height: 200,
                                       margin_top: 5,
                                       title: _("Sharing Settings"),
                                       hexpand: true });
        this.widget.add_button(_("Done"), Gtk.ResponseType.OK);  // Label for Done button in Sharing dialog

        let grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                  column_spacing: 6,
                                  row_spacing: 6,
                                  margin_left: 12,
                                  margin_right: 12,
                                  margin_bottom: 12 });
      	let contentArea = this.widget.get_content_area();
        contentArea.pack_start(grid, true, true, 0);

        let sw = new Gtk.ScrolledWindow({ shadow_type: Gtk.ShadowType.IN,
                                          margin_bottom: 3,
                                          hexpand: true, }); // Add with viewport so can switch from spinner to liststore. I don't know how to do this switching thing! maybe I need two functions for the building & rebuilding the UI?
        sw.set_size_request(-1, 250);
        grid.attach(sw, 0, 0, 3, 1);
        rows++;

        this.model = Gtk.ListStore.new(
            [ GObject.TYPE_STRING,
              GObject.TYPE_STRING ]);

        this.tree = new Gtk.TreeView({ headers_visible: false,
                                       vexpand: true,
                                       hexpand: true });
        this.tree.set_model(this.model);
        this.tree.show();
        sw.add(this.tree);

        this._viewCol = new Gtk.TreeViewColumn();
        this.tree.append_column(this._viewCol);

        // Name column
        this._rendererText = new Gtk.CellRendererText({ xpad: 6,
                                                        ypad: 4 });
        this._viewCol.pack_start(this._rendererText, true);
        this._viewCol.add_attribute(this._rendererText,
                                    'text', SharingDialogColumns.NAME);

        // Role column
        this._rendererDetail = new GdPrivate.StyledTextRenderer({ xpad: 16 });
        this._rendererDetail.add_class('dim-label');
        this._viewCol.pack_start(this._rendererDetail, false);
        this._viewCol.add_attribute(this._rendererDetail,
                                    'text', SharingDialogColumns.ROLE);

        this._docSharing = new Gtk.Label ({ label: '<b>' + _("Document permissions") + '</b>', 
                                            // Label for widget group used for adding new contacts
                                            halign: Gtk.Align.START,
                                            use_markup: true,
                                            hexpand: false });
        this._docSharing.get_style_context().add_class('dim-label');
        grid.add(this._docSharing);
        rows++;

        this._permissionLabel = this.docPrivate; // Label for private permission setting
        this._setting = new Gtk.Label({ label: _(this._permissionLabel),
                                        halign: Gtk.Align.START,
                                        hexpand: false });
        grid.add(this._setting); // Again, I need to show this after the permission is retrieved? look @ miner files & see if there is any info to use here

        this._changePermission = new Gtk.Button({ label: _("Change"), // Label for permission change in Sharing dialog
                                                  halign: Gtk.Align.START });
        this._changePermission.connect("clicked", Lang.bind(this, this._permissionPopUp));
        grid.attach(this._changePermission, 2, rows, 1, 1);
        rows++;

        this._add = new Gtk.Label ({ label: '<b>' +  _("Add people") + '</b>', // Label for widget group used for adding new contacts
                                     halign: Gtk.Align.START,
                                     use_markup: true,
                                     hexpand: false });
        this._add.get_style_context().add_class('dim-label');
        grid.add(this._add);
        rows++;

        this._addContact = new Gtk.Entry({ placeholder_text: _("Enter an email address"), // Editable text in entry field
                                           editable: true,
                                           hexpand: true,
                                           halign: Gtk.Align.START });
        this._addContact.connect('changed', Lang.bind(this,
            function() {
                let hasText = !!this._addContact.get_text();
                this._saveShare.sensitive = hasText;
                this._comboBoxText.sensitive = hasText;
            }));
        grid.add(this._addContact);

        this._comboBoxText = new Gtk.ComboBoxText({ sensitive: false });
        let combo = [_("Can edit"), _("Can view") ]; // Permission setting labels in combobox
        for (let i = 0; i < combo.length; i++)
            this._comboBoxText.append_text(combo[i]);

        this._comboBoxText.set_active(0);
        grid.attach_next_to(this._comboBoxText, this._addContact, 1, 1, 1);

      /* There is no API for this
        this._notify = new Gtk.CheckButton({ label: _("Notify contact via gmail") }); // Label for checkbutton
        grid.add(this._notify);
        this._notify.set_active(false);
        //send an email with link to document via Google
        this._notify.connect("toggled", Lang.bind(this, this._prepareEmail));
                                                                            */

        this._saveShare = new Gtk.Button({ label: _("Add"),
                                           sensitive: false });
        this._saveShare.connect ('clicked', Lang.bind(this, this._onAddClicked));
        grid.attach_next_to(this._saveShare, this._comboBoxText, 1, 1, 1);

        this.widget.show_all();
    },

    _permissionPopUp: function() { //this needs to be themed, right now it is ugly
        this.popUpWindow  = new Gtk.Dialog({ resizable: false,
                                             transient_for: this.widget,
                                             modal: true,
                                             destroy_with_parent: true,
                                             default_width: 400,
                                             default_height: 600,
                                             hexpand: false,
                                             title: _("Document Permissions") });

        let popUpGrid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                       column_homogeneous: true,
                                       halign: Gtk.Align.CENTER,
                                       row_spacing: 12,
                                       column_spacing: 24,
                                       margin_left: 24,
                                       margin_right: 24,
                                       margin_bottom: 12 });

        this.button1 = new Gtk.RadioButton ({ label: _("Private")}); 
        this.button1.connect('clicked', Lang.bind (this, this._setDoc));
        popUpGrid.attach(this.button1, 0, 2, 1, 1);
        this.button2 =  new Gtk.RadioButton({ label: _("Public"),  // Label for radiobutton that sets doc permission to public
                                              group: this.button1 });       
        this.button2.connect('clicked', Lang.bind (this, this._setDoc));
        if(this.docPrivate == "Public") {
            this.button2.set_active(true);
        }
        popUpGrid.attach(this.button2, 0, 3, 1, 1);

        this._check = new Gtk.CheckButton({ label: _("Can edit")});
        if(this.pubEdit == false)
            this._check.set_active(false);
        else
            this._check.set_active(true);
        this._check.connect ("toggled", Lang.bind (this, this._setDocumentRole));
        popUpGrid.attach(this._check, 0, 5, 1, 1);

        this._close = new Gtk.Button({ label: _("Done") }); // Label for Done button permissions popup window
        this._close.connect('clicked', Lang.bind(this,
            function() {             
                this._sendNewDocumentRule();
                this.popUpWindow.destroy();
            }));

        popUpGrid.attach(this._close, 0, 6, 1, 1);

        let popUpContentArea = this.popUpWindow.get_content_area();
        popUpContentArea.pack_start(popUpGrid, true, true, 2);
        this.popUpWindow.show_all();
    },

    // Get the id of the selected doc from the sourceManager, give auth info to Google, and start the service
    _createGDataEntry: function() {
        let source = Global.sourceManager.getItemById(this.resourceUrn);

        let authorizer = new GData.GoaAuthorizer({ goa_object: source.object });
        let service = new GData.DocumentsService({ authorizer: authorizer });

        // Query the service for the entry related to the doc
        service.query_single_entry_async
            (service.get_primary_authorization_domain(),
            this.identifier, null,
            GData.DocumentsText, null, Lang.bind(this,
                function(object, res) {
                    try {
                        this.entry = object.query_single_entry_finish(res);
                        this._getGDataEntryRules(this.entry, service);
                    } catch (e) {
                        log("Error getting GData Entry " + e.message);
                    }
                }));
    },

    // Return a feed containing the acl related to the entry
    _getGDataEntryRules: function(entry, service) {
        this.entry.get_rules_async(service, null, null, Lang.bind(this,
            function(entry, result) {
                try {
                    this.feed = service.query_finish(result);
                    this._getScopeRulesEntry(this.feed);
	            } catch(e) {
                    log("Error getting ACL Feed " + e.message);
	            }
         }));
    },

     // Get each entry (person) from the feed, and get the scope for each person, and then store the emails and values in an array
    _getScopeRulesEntry: function(feed) {
        let entries = this.feed.get_entries();
        let testValues = [];
        let values = [];

        entries.forEach(Lang.bind(this,
            function(entry) {
                let [type, value] = entry.get_scope();
                let role = entry.get_role();
                if(value != null) {
                    values.push({ name: value, role: this._getUserRoleString(role) });                   
                }
                else if(value == null) {
                    this.docPrivate = "Public"; 
                    if(role == 'writer')
                        this.pubEdit = true; 
                }
             }));

         // Set values in the treemodel
         values.forEach(Lang.bind (this,
             function(value) {
                 let iter = this.model.append();
                 this.model.set(iter,
                     [ SharingDialogColumns.NAME,
                       SharingDialogColumns.ROLE ],
                     [ value.name, value.role ])
        }));
        this.showTree = true;
        if(this.docPrivate == "")
            this.docPrivate = "Private";   
    },

    // Get the roles, and make a new array containing strings that start with capital letters
    _getUserRoleString: function(role) {
        if(role.charAt(0) == 'o')
            return _("Owner"); // Owner permission for document user listed in treeview

        if(role.charAt(0) == 'w')
            return _("Writer"); // Writer permission for document user listed in treeview

        if(role.charAt(0) == 'r')
            return _("Reader"); // Reader permission for document user listed in treeview

        return '';
    },

    // Send the new contact and its permissions to Google Docs
    _onAddClicked: function() {
        if(this._isValidEmail()) {
            let source = Global.sourceManager.getItemById(this.resourceUrn);

            let authorizer = new GData.GoaAuthorizer({ goa_object: source.object });
            let service = new GData.DocumentsService({ authorizer: authorizer });
            let accessRule = new GData.AccessRule();

            let newContact = this._getNewContact();
            accessRule.set_role(newContact.role);
            accessRule.set_scope(GData.ACCESS_SCOPE_USER, newContact.name);

            let aclLink = this.entry.look_up_link(GData.LINK_ACCESS_CONTROL_LIST);

            service.insert_entry_async(service.get_primary_authorization_domain(),
                aclLink.get_uri(), accessRule, null, Lang.bind(this,
                    function(service, res) {
                        try {
                            let insertedAccessRule = service.insert_entry_finish(res);
                            let roleString = this._getUserRoleString(newContact.role);
                            let iter = this.model.append();
                            this.model.set(iter,
                            [ SharingDialogColumns.NAME,
                            SharingDialogColumns.ROLE ],
                            [ newContact.name,
                            roleString]);//        
                        } catch(e) {
                            log("Error inserting new ACL rule " + e.message);
		         		}
                    }));
            
        }
        else {
           this._showErrorDialog(); 
        }
    },

    _sendNewDocumentRule: function() {
 	        
            let source = Global.sourceManager.getItemById(this.resourceUrn);

            let authorizer = new GData.GoaAuthorizer({ goa_object: source.object });
            let service = new GData.DocumentsService({ authorizer: authorizer });

            let docAccessRule = this._getDocumentPermission();
            log(docAccessRule);
            let newDocRole = this._getDocumentRole();
            let entries = this.feed.get_entries();
            let values = [];
            let count = 0;
            let arrIndex = 0;
            let flag = "";
                entries.forEach(Lang.bind(this,
                    function(individualEntry) {
                        let [type, value] = individualEntry.get_scope();
                        log('type'); 
                        log(type);
                        log('value');
                        log(value);
                        let role = individualEntry.get_role();
                        log('role');
                        log(role);
                        if(type == "default") {
                            arrIndex = count;
                            if(docAccessRule == GData.ACCESS_SCOPE_USER)
                                flag = "deletePub";
                            else if(newDocRole != role)
                                 flag = "changePub";
                            
                        }
                        count++;  
                }));
            if(flag == "" && docAccessRule == GData.ACCESS_SCOPE_DEFAULT)
                flag = "addPub";
 
            if(flag != '') {
      
                if(flag == "addPub") { 
                // If we are making the doc public, send a new permission
                    let accessRule = new GData.AccessRule();
                    let aclLink = this.entry.look_up_link(GData.LINK_ACCESS_CONTROL_LIST);

                    accessRule.set_scope(docAccessRule, null);
                    accessRule.set_role(newDocRole);
                    service.insert_entry_async(service.get_primary_authorization_domain(),
                        aclLink.get_uri(), accessRule, null, Lang.bind(this,
                            function(service, res) {
                                try {
                                    let insertedAccessRule = service.insert_entry_finish(res);
                                } catch(e) {
                                    log("Error inserting new ACL scope for document" + e.message);
		         			    }
                        }));
                }
             
                if(flag == "changePub") { 
                // If we are changing the role, update the entry              
                    let accessRule = entries[arrIndex];//works
                        log(accessRule.role);
                        accessRule.set_role(newDocRole);
                        service.update_entry_async(service.get_primary_authorization_domain(), 
                            accessRule, null, Lang.bind(this,
                                function(service, res) {
                                    try {
                                        let updatedAccessRule = service.update_entry_finish(res);
                                    } catch(e) {
                                        log("Error updating ACL scope for document" + e.message);
		         			        }
                        }));
                }
                      
                if(flag == "deletePub") { 
                // If we are changing the permission to private, delete the public entry.
                    let accessRule = entries[arrIndex];
                    service.delete_entry_async(service.get_primary_authorization_domain(), // works
                    accessRule, null, Lang.bind(this,
                        function(service, res) {
                            try {
                                let afterDeletedAccessRule = service.delete_entry_finish(res);
                            } catch(e) {
                                log("Error deleting ACL scope for document" + e.message);
		         			}
                    }));
                }
               /* let entr = this.feed.get_entries();//weird test
                log("test");
                log(entr[0]);
                let accessRule = entr[2];
                accessRule.set_role(GData.DOCUMENTS_ACCESS_ROLE_WRITER);
                        service.update_entry_async(service.get_primary_authorization_domain(), 
                        accessRule, null, Lang.bind(this,
                        function(service, res) {
                            try {
                                let insertedAccessRule = service.update_entry_finish(res);
                            } catch(e) {
                                log("Error deleting ACL scope for document" + e.message);
		         			}
                    }));*/
        }    
    },


	// Get the role for the new contact from the combobox
    _getNewContact: function() {
        let activeItem = this._comboBoxText.get_active();
        let newContact = { name: this._addContact.get_text() };

        if (activeItem == 0)
            newContact.role = GData.DOCUMENTS_ACCESS_ROLE_WRITER;
        else if (activeItem == 1)
            newContact.role = GData.DOCUMENTS_ACCESS_ROLE_READER;

        return newContact;
    },

    _getDocumentPermission: function() {
        let docAccRule = null;      
        if (this.button1.get_active()) {
        	this.docAccRule = GData.ACCESS_SCOPE_USER;
        }
        else if (this.button2.get_active()) {
        	this.docAccRule = GData.ACCESS_SCOPE_DEFAULT;   
        }

        return this.docAccRule;              
    },

    _setDocumentRole: function() { // this function is useless, so does the checkbox have to call a function? If not remove this.
        let newDocRole = null;
        if (this._check.get_active()) {
            this.newDocRole = GData.DOCUMENTS_ACCESS_ROLE_WRITER;
        }
    },
   
    _getDocPrivateString: function() {//Make this useful by replacing an empty label with a docPrivate label after the permissions get here from Google.
        return this.docPrivate;
    },

    _getDocumentRole: function() {
        let newDocRole = null;
            if (this._check.get_active()) 
                this.newDocRole = GData.DOCUMENTS_ACCESS_ROLE_WRITER;
                
            
            else
                this.newDocRole = GData.DOCUMENTS_ACCESS_ROLE_READER;

        return this.newDocRole;
    },

    _setDoc: function() {
        this.changed = true;
        log(this.changed);
    },
    
    _isValidEmail: function() { 
        let emailString = this._addContact.get_text();
        // Use Ross Kendell's RegEx to check for valid email address
        return /^([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22))*\x40([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d))*$/.test(emailString);
    },

    _showErrorDialog: function () {
        this._errorDialog = new Gtk.MessageDialog ({
            transient_for: this.widget,
            modal: true,
            destroy_with_parent: true,
            buttons: Gtk.ButtonsType.OK,
            message_type: Gtk.MessageType.WARNING,
            text: "Email address is not valid" }); // Text for error dialog for invalid email address entered

        this._errorDialog.connect ('response', Lang.bind(this, this._closeErrorDialog));
        this._errorDialog.show();
    },
    
    _closeErrorDialog: function() {
        this._errorDialog.destroy();
    },

    _getAccountName: function() {//need to implement mtaching owner of document name against goa email address
        let source = Global.sourceManager.getItemById(this.resourceUrn);

        let authorizer = new GData.GoaAuthorizer({ goa_object: source.object });

        log(authorizer);
   }
});

