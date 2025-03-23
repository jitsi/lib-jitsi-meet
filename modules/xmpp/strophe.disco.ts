/* eslint-disable */

import { $iq, Strophe } from 'strophe.js';

interface IIdentity {
    category: string;
    type: string;
    name: string;
    lang: string;
}

interface IItem {
    jid: string;
    name: string;
    node: string;
    call_back: Function;
}

interface DiscoPlugin {
    _connection: Strophe.Connection | null;
    _identities: IIdentity[];
    _features: string[];
    _items: IItem[];
    init(conn: Strophe.Connection): void;
    addIdentity(category: string, type: string, name?: string, lang?: string): boolean;
    addFeature(var_name: string): boolean;
    removeFeature(var_name: string): boolean;
    addItem(jid: string, name: string, node: string, call_back: Function): boolean;
    info(jid: string, node: string, success: Function, error: Function, timeout: number): void;
    items(jid: string, node: string, success: Function, error: Function, timeout: number): void;
    _buildIQResult(stanza: Element, query_attrs: object): any;
    _onDiscoInfo(stanza: Element): boolean;
    _onDiscoItems(stanza: Element): boolean;
}

Strophe.addConnectionPlugin('disco', <DiscoPlugin>{
    _connection: null,
    _identities: [],
    _features: [],
    _items: [],
    /** Function: init
     * Plugin init
     *
     * Parameters:
     *   (Strophe.Connection) conn - Strophe connection
     */
    init: function(conn: Strophe.Connection) {
        this._connection = conn;
        this._identities = [];
        this._features = [];
        this._items = [];
        // disco info
        conn.addHandler(this._onDiscoInfo.bind(this), Strophe.NS.DISCO_INFO, 'iq', 'get', null, null);
        // disco items
        conn.addHandler(this._onDiscoItems.bind(this), Strophe.NS.DISCO_ITEMS, 'iq', 'get', null, null);
    },
    /** Function: addIdentity
     * See http://xmpp.org/registrar/disco-categories.html
     * Parameters:
     *   (String) category - category of identity (like client, automation, etc ...)
     *   (String) type - type of identity (like pc, web, bot , etc ...)
     *   (String) name - name of identity in natural language
     *   (String) lang - lang of name parameter
     *
     * Returns:
     *   Boolean
     */
    addIdentity: function(category: string, type: string, name: string = '', lang: string = ''): boolean {
        for (let i = 0; i < this._identities.length; i++) {
            if (this._identities[i].category == category &&
                this._identities[i].type == type &&
                this._identities[i].name == name &&
                this._identities[i].lang == lang) {
                return false;
            }
        }
        this._identities.push({ category, type, name, lang });
        return true;
    },
    /** Function: addFeature
     *
     * Parameters:
     *   (String) var_name - feature name (like jabber:iq:version)
     *
     * Returns:
     *   boolean
     */
    addFeature: function(var_name: string): boolean {
        if (this._features.includes(var_name)) {
            return false;
        }
        this._features.push(var_name);
        return true;
    },
    /** Function: removeFeature
     *
     * Parameters:
     *   (String) var_name - feature name (like jabber:iq:version)
     *
     * Returns:
     *   boolean
     */
    removeFeature: function(var_name: string): boolean {
        const index = this._features.indexOf(var_name);
        if (index !== -1) {
            this._features.splice(index, 1);
            return true;
        }
        return false;
    },
    /** Function: addItem
     *
     * Parameters:
     *   (String) jid
     *   (String) name
     *   (String) node
     *   (Function) call_back
     *
     * Returns:
     *   boolean
     */
    addItem: function(jid: string, name: string, node: string, call_back: Function): boolean {
        if (node && !call_back) {
            return false;
        }
        this._items.push({ jid, name, node, call_back });
        return true;
    },
    /** Function: info
     * Info query
     *
     * Parameters:
     *   (Function) call_back
     *   (String) jid
     *   (String) node
     */
    info: function(jid: string, node: string, success: Function, error: Function, timeout: number): void {
        const attrs: any = { xmlns: Strophe.NS.DISCO_INFO };
        if (node) {
            attrs.node = node;
        }
        const info = $iq({ from: this._connection!.jid, to: jid, type: 'get' }).c('query', attrs);
        this._connection!.sendIQ(info, success, error, timeout);
    },
    /** Function: items
     * Items query
     *
     * Parameters:
     *   (Function) call_back
     *   (String) jid
     *   (String) node
     */
    items: function(jid: string, node: string, success: Function, error: Function, timeout: number): void {
        const attrs: any = { xmlns: Strophe.NS.DISCO_ITEMS };
        if (node) {
            attrs.node = node;
        }
        const items = $iq({ from: this._connection!.jid, to: jid, type: 'get' }).c('query', attrs);
        this._connection!.sendIQ(items, success, error, timeout);
    },
    /** PrivateFunction: _buildIQResult
     */
    _buildIQResult: function(stanza: Element, query_attrs: object): any {
        const id = stanza.getAttribute('id');
        const from = stanza.getAttribute('from');
        const iqresult = $iq({ type: 'result', id: id });

        if (from !== null) {
            iqresult.attrs({ to: from });
        }

        return iqresult.c('query', query_attrs);
    },
    /** PrivateFunction: _onDiscoInfo
     * Called when receive info request
     */
    _onDiscoInfo: function(stanza: Element): boolean {
        const node = stanza.getElementsByTagName('query')[0].getAttribute('node');
        const attrs: any = { xmlns: Strophe.NS.DISCO_INFO };
        if (node) {
            attrs.node = node;
        }
        const iqresult = this._buildIQResult(stanza, attrs);
        for (let i = 0; i < this._identities.length; i++) {
            const identityAttrs: any = {
                category: this._identities[i].category,
                type: this._identities[i].type
            };
            if (this._identities[i].name) {
                identityAttrs.name = this._identities[i].name;
            }
            if (this._identities[i].lang) {
                identityAttrs['xml:lang'] = this._identities[i].lang;
            }
            iqresult.c('identity', identityAttrs).up();
        }
        for (let i = 0; i < this._features.length; i++) {
            iqresult.c('feature', { 'var': this._features[i] }).up();
        }
        this._connection!.send(iqresult.tree());
        return true;
    },
    /** PrivateFunction: _onDiscoItems
     * Called when receive items request
     */
    _onDiscoItems: function(stanza: Element): boolean {
        const query_attrs: any = { xmlns: Strophe.NS.DISCO_ITEMS };
        const node = stanza.getElementsByTagName('query')[0].getAttribute('node');
        let items: IItem[] = [];
        if (node) {
            query_attrs.node = node;
            for (let i = 0; i < this._items.length; i++) {
                if (this._items[i].node == node) {
                    items = this._items[i].call_back(stanza);
                    break;
                }
            }
        } else {
            items = this._items;
        }
        const iqresult = this._buildIQResult(stanza, query_attrs);
        for (let i = 0; i < items.length; i++) {
            const attrs: any = { jid: items[i].jid };
            if (items[i].name) {
                attrs.name = items[i].name;
            }
            if (items[i].node) {
                attrs.node = items[i].node;
            }
            iqresult.c('item', attrs).up();
        }
        this._connection!.send(iqresult.tree());
        return true;
    }
});
