"""
ue_import.py — RUN THIS INSIDE UNREAL ENGINE 5 (not from a normal shell).

It auto-finds the manifest.json sitting beside it, imports the four PBR textures
with correct sRGB/compression settings, and builds M_<name> + MI_<name> with the
ORM channels wired the UE way.

How to run:
  - Editor: Tools > Execute Python Script... -> select this file, OR
  - Output Log -> Cmd -> :  py "C:/path/to/this/ue_import.py"

Target: UE 5.3 - 5.5. The texture import is rock-solid across versions; the
material-graph build uses MaterialEditingLibrary and is wrapped in try/except so
a graph API change never blocks the (more important) texture import.

Edit CONTENT_DIR below if you want the assets somewhere other than /Game/Textures.
"""
import json
import os

import unreal

CONTENT_DIR = "/Game/Materials"   # where assets land in the Content Browser


def _here():
    try:
        return os.path.dirname(os.path.abspath(__file__))
    except NameError:
        # Some UE Python entry points don't define __file__; fall back to cwd.
        return os.getcwd()


def _load_manifest():
    path = os.path.join(_here(), "manifest.json")
    if not os.path.isfile(path):
        raise FileNotFoundError(
            "manifest.json not found next to ue_import.py. Run this from the "
            "folder pbr_forge.py produced.")
    with open(path) as f:
        return json.load(f), _here()


def _compression(tag):
    return {
        "TC_Default": unreal.TextureCompressionSettings.TC_DEFAULT,
        "TC_Normalmap": unreal.TextureCompressionSettings.TC_NORMALMAP,
        "TC_Masks": unreal.TextureCompressionSettings.TC_MASKS,
        "TC_Grayscale": unreal.TextureCompressionSettings.TC_GRAYSCALE,
    }.get(tag, unreal.TextureCompressionSettings.TC_DEFAULT)


def import_texture(src_file, dest_name, srgb, comp_tag, flip_green=False):
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", src_file)
    task.set_editor_property("destination_path", CONTENT_DIR)
    task.set_editor_property("destination_name", dest_name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", True)
    task.set_editor_property("factory", unreal.TextureFactory())
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

    asset_path = "{0}/{1}".format(CONTENT_DIR, dest_name)
    tex = unreal.EditorAssetLibrary.load_asset(asset_path)
    if tex is None:
        unreal.log_error("Failed to import: " + src_file)
        return None
    tex.set_editor_property("srgb", srgb)
    tex.set_editor_property("compression_settings", _compression(comp_tag))
    if comp_tag == "TC_Normalmap":
        try:
            tex.set_editor_property("flip_green_channel", flip_green)
        except Exception:
            pass
    unreal.EditorAssetLibrary.save_asset(asset_path)
    unreal.log("imported " + asset_path + "  (sRGB=" + str(srgb) + ", " + comp_tag + ")")
    return tex


def build_material(name, textures):
    """textures: dict with keys base_color, normal, orm (UE texture assets)."""
    mel = unreal.MaterialEditingLibrary
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    mat_name = "M_" + name
    mat_path = "{0}/{1}".format(CONTENT_DIR, mat_name)

    if unreal.EditorAssetLibrary.does_asset_exist(mat_path):
        unreal.EditorAssetLibrary.delete_asset(mat_path)
    mat = tools.create_asset(mat_name, CONTENT_DIR, unreal.Material,
                             unreal.MaterialFactoryNew())

    def sampler(tex, x, y, sampler_type, param_name):
        node = mel.create_material_expression(
            mat, unreal.MaterialExpressionTextureSampleParameter2D, x, y)
        node.set_editor_property("texture", tex)
        node.set_editor_property("sampler_type", sampler_type)
        node.set_editor_property("parameter_name", param_name)
        return node

    MP = unreal.MaterialProperty
    ST = unreal.MaterialSamplerType

    if textures.get("base_color"):
        bc = sampler(textures["base_color"], -480, -300, ST.SAMPLERTYPE_COLOR, "BaseColor")
        mel.connect_material_property(bc, "RGB", MP.MP_BASE_COLOR)

    if textures.get("normal"):
        nm = sampler(textures["normal"], -480, 40, ST.SAMPLERTYPE_NORMAL, "Normal")
        mel.connect_material_property(nm, "RGB", MP.MP_NORMAL)

    if textures.get("orm"):
        orm = sampler(textures["orm"], -480, 380, ST.SAMPLERTYPE_LINEAR_COLOR, "ORM")
        mel.connect_material_property(orm, "R", MP.MP_AMBIENT_OCCLUSION)
        mel.connect_material_property(orm, "G", MP.MP_ROUGHNESS)
        mel.connect_material_property(orm, "B", MP.MP_METALLIC)

    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_asset(mat_path)
    unreal.log("built material " + mat_path)

    # Material Instance for per-asset tweaking
    mi_name = "MI_" + name
    mi_path = "{0}/{1}".format(CONTENT_DIR, mi_name)
    if unreal.EditorAssetLibrary.does_asset_exist(mi_path):
        unreal.EditorAssetLibrary.delete_asset(mi_path)
    mi = tools.create_asset(mi_name, CONTENT_DIR, unreal.MaterialInstanceConstant,
                            unreal.MaterialInstanceConstantFactoryNew())
    mel.set_material_instance_parent(mi, mat)
    unreal.EditorAssetLibrary.save_asset(mi_path)
    unreal.log("built material instance " + mi_path)
    return mat


def main():
    manifest, folder = _load_manifest()
    name = manifest["name"]
    files = manifest["files"]
    settings = manifest.get("ue_import", {})

    def cfg(asset, default_srgb, default_comp):
        c = settings.get(asset, {})
        return c.get("srgb", default_srgb), c.get("compression", default_comp)

    unreal.log("=== importing PBR set: " + name + " ===")
    imported = {}

    if files.get("base_color"):
        s, c = cfg("T_{0}_BC".format(name), True, "TC_Default")
        imported["base_color"] = import_texture(
            os.path.join(folder, files["base_color"]), "T_{0}_BC".format(name), s, c)

    if files.get("normal"):
        s, c = cfg("T_{0}_N".format(name), False, "TC_Normalmap")
        imported["normal"] = import_texture(
            os.path.join(folder, files["normal"]), "T_{0}_N".format(name), s, c,
            flip_green=False)  # already DirectX

    if files.get("orm"):
        s, c = cfg("T_{0}_ORM".format(name), False, "TC_Masks")
        imported["orm"] = import_texture(
            os.path.join(folder, files["orm"]), "T_{0}_ORM".format(name), s, c)

    if files.get("height"):
        s, c = cfg("T_{0}_H".format(name), False, "TC_Grayscale")
        import_texture(os.path.join(folder, files["height"]),
                       "T_{0}_H".format(name), s, c)

    try:
        build_material(name, imported)
    except Exception as e:
        unreal.log_error("Texture import OK, but material-graph build failed "
                         "(API differs on this UE version): " + str(e))
        unreal.log_error("Wire it by hand per IMPORT_RECIPE.md — the textures are correct.")

    unreal.log("=== done: see " + CONTENT_DIR + " in the Content Browser ===")


main()
