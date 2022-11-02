# ERPNext Expenses © 2022
# Author:  Ameen Ahmed
# Company: Level Up Marketing & Software Development Services
# Licence: Please refer to license.txt


import json

import frappe
from frappe import _
from frappe.utils.logger import set_log_level

from expenses import __production__


if not __production__:
    set_log_level("DEBUG")
    _LOGGER = frappe.logger("expenses", file_count=50)


def error(msg, throw=True):
    frappe.log_error("Expenses", msg)
    if throw:
        frappe.throw(msg, title="Expenses")


def log_error(data):
    if _LOGGER:
        _LOGGER.error(data)
    else:
        log_fallback(data)


def log_info(data):
    if _LOGGER:
        _LOGGER.info(data)
    else:
        log_fallback(data)


def log_fallback(data):
    if data and not isinstance(data, dict):
        data = {"data": data}
    
    raw = to_json_if_valid(data, 0)
    if not raw:
        try:
            raw = str(data)
        except Exception:
            pass
    
    if raw:
        frappe.log_error("Expenses Log", raw)


def get_cache(dt: str, key: str):
    return frappe.cache().hget(dt, key)


def set_cache(dt: str, key: str, data):
    frappe.cache().hset(dt, key, data)


def del_cache(dt: str, key: str):
    frappe.cache().hdel(dt, key)


def clear_cache(dt):
    frappe.cache().delete_key(dt)


def clear_document_cache(dt, name=None):
    if name is None:
        name = dt
    
    frappe.clear_cache(doctype=dt)
    frappe.clear_document_cache(dt, name)
    clear_cache(dt)


def get_cached_doc(dt, name=None, for_update=False):
    if name is None:
        name = dt
    elif isinstance(name, bool):
        for_update = name
        name = dt
    
    if for_update:
        clear_document_cache(dt)
    
    return frappe.get_cached_doc(dt, name, for_update=for_update)


def get_cached_value(dt, name, field):
    val = frappe.get_cached_value(dt, name, field)
    if not val:
        val = frappe.get_value(dt, filters={"name": name}, fieldname=field)
    if val and isinstance(val, list):
        val = val.pop()
    if not val:
        error(_("Unable to get get the value of {0} from {1} with id {2}").format(
            field, dt, name
        ))
    return val


def parse_json_if_valid(data, default=None):
    if not data:
        return data
    
    if default is None:
        default = data
    
    try:
        return json.loads(data)
    except Exception:
        return default


def to_json_if_valid(data, default=None):
    if not data:
        return data
    
    if default is None:
        default = data
    
    try:
        return json.dumps(data)
    except Exception:
        return default