import JSZip from "jszip";
import type { UEMaps } from "./pbr";

export function slugify(s: string): string {
  const clean = (s || "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (clean || "Material").slice(0, 40);
}

export function buildManifest(
  name: string,
  material: string,
  resolution: number,
  seed?: number | null,
  baseColorExt: "png" | "jpg" = "png",
) {
  return {
    name,
    material_label: material,
    resolution,
    normal_convention: "DirectX (UE-ready)",
    files: {
      base_color: `T_${name}_BC.${baseColorExt}`,
      normal: `T_${name}_N.png`,
      orm: `T_${name}_ORM.png`,
      height: `T_${name}_H.png`,
    },
    ue_import: {
      [`T_${name}_BC`]: { srgb: true, compression: "TC_Default" },
      [`T_${name}_N`]: { srgb: false, compression: "TC_Normalmap", flip_green: false, note: "already DirectX" },
      [`T_${name}_ORM`]: { srgb: false, compression: "TC_Masks", channels: "R=AO G=Roughness B=Metallic" },
      [`T_${name}_H`]: { srgb: false, compression: "TC_Grayscale", note: "16-bit container in core-proof; tessellation/Nanite displacement" },
    },
    fal_seed: seed ?? null,
    generated_by: "TextureForge",
  };
}

export function importRecipe(name: string): string {
  return `# UE5 import recipe — ${name}

Two ways into Unreal Engine 5:

## A. Automated
Run \`ue_import.py\` inside UE (Tools > Execute Python Script, or Output Log Cmd: \`py "<path>/ue_import.py"\`). It auto-finds manifest.json beside it and builds M_${name} + MI_${name}.

## B. Manual
Import the PNGs, then set per texture:

| Texture | sRGB | Compression | Notes |
|---|---|---|---|
| T_${name}_BC  | ON  | Default   | base color |
| T_${name}_N   | OFF | Normalmap | already DirectX — leave Flip Green OFF |
| T_${name}_ORM | OFF | Masks     | R=AO, G=Roughness, B=Metallic |
| T_${name}_H   | OFF | Grayscale | tessellation / Nanite displacement |

Wiring: BC.RGB -> Base Color · N.RGB -> Normal · ORM.R -> AO · ORM.G -> Roughness · ORM.B -> Metallic · H -> displacement.

### Gotchas
1. ORM/Normal must be sRGB OFF or lighting goes wrong.
2. Normal is DirectX; if it looks inside-out, toggle Flip Green.
3. Keep height un-compressed-ish (Grayscale) for clean displacement.
`;
}

// Manifest-driven importer; run INSIDE Unreal. Mirrors core-proof/ue_import.py.
export const UE_IMPORT_SCRIPT = String.raw`"""
ue_import.py — RUN INSIDE UNREAL ENGINE 5.
Auto-finds manifest.json beside it, imports the PBR textures with correct
sRGB/compression, and builds M_<name> + MI_<name>.

Run: Tools > Execute Python Script... (pick this file), or Output Log Cmd:
  py "C:/path/to/ue_import.py"
Target: UE 5.3 - 5.5. Edit CONTENT_DIR to change where assets land.
"""
import json
import os
import unreal

CONTENT_DIR = "/Game/Materials"


def _here():
    try:
        return os.path.dirname(os.path.abspath(__file__))
    except NameError:
        return os.getcwd()


def _compression(tag):
    return {
        "TC_Default": unreal.TextureCompressionSettings.TC_DEFAULT,
        "TC_Normalmap": unreal.TextureCompressionSettings.TC_NORMALMAP,
        "TC_Masks": unreal.TextureCompressionSettings.TC_MASKS,
        "TC_Grayscale": unreal.TextureCompressionSettings.TC_GRAYSCALE,
    }.get(tag, unreal.TextureCompressionSettings.TC_DEFAULT)


def import_texture(src_file, dest_name, srgb, comp_tag):
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
            tex.set_editor_property("flip_green_channel", False)
        except Exception:
            pass
    unreal.EditorAssetLibrary.save_asset(asset_path)
    unreal.log("imported " + asset_path)
    return tex


def build_material(name, textures):
    mel = unreal.MaterialEditingLibrary
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    mat_path = "{0}/M_{1}".format(CONTENT_DIR, name)
    if unreal.EditorAssetLibrary.does_asset_exist(mat_path):
        unreal.EditorAssetLibrary.delete_asset(mat_path)
    mat = tools.create_asset("M_" + name, CONTENT_DIR, unreal.Material, unreal.MaterialFactoryNew())
    MP = unreal.MaterialProperty
    ST = unreal.MaterialSamplerType

    def sampler(tex, x, y, stype, pname):
        node = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSampleParameter2D, x, y)
        node.set_editor_property("texture", tex)
        node.set_editor_property("sampler_type", stype)
        node.set_editor_property("parameter_name", pname)
        return node

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

    mi_path = "{0}/MI_{1}".format(CONTENT_DIR, name)
    if unreal.EditorAssetLibrary.does_asset_exist(mi_path):
        unreal.EditorAssetLibrary.delete_asset(mi_path)
    mi = tools.create_asset("MI_" + name, CONTENT_DIR, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mel.set_material_instance_parent(mi, mat)
    unreal.EditorAssetLibrary.save_asset(mi_path)


def main():
    folder = _here()
    with open(os.path.join(folder, "manifest.json")) as f:
        manifest = json.load(f)
    name = manifest["name"]
    files = manifest["files"]
    cfg = manifest.get("ue_import", {})

    def setting(asset, dsrgb, dcomp):
        c = cfg.get(asset, {})
        return c.get("srgb", dsrgb), c.get("compression", dcomp)

    unreal.log("=== TextureForge import: " + name + " ===")
    imported = {}
    s, c = setting("T_{0}_BC".format(name), True, "TC_Default")
    imported["base_color"] = import_texture(os.path.join(folder, files["base_color"]), "T_{0}_BC".format(name), s, c)
    s, c = setting("T_{0}_N".format(name), False, "TC_Normalmap")
    imported["normal"] = import_texture(os.path.join(folder, files["normal"]), "T_{0}_N".format(name), s, c)
    s, c = setting("T_{0}_ORM".format(name), False, "TC_Masks")
    imported["orm"] = import_texture(os.path.join(folder, files["orm"]), "T_{0}_ORM".format(name), s, c)
    s, c = setting("T_{0}_H".format(name), False, "TC_Grayscale")
    import_texture(os.path.join(folder, files["height"]), "T_{0}_H".format(name), s, c)

    try:
        build_material(name, imported)
    except Exception as e:
        unreal.log_error("Textures imported OK; material build failed on this UE version: " + str(e))
        unreal.log_error("Wire 6 nodes by hand per IMPORT_RECIPE.md.")
    unreal.log("=== done -> " + CONTENT_DIR + " ===")


main()
`;

export async function buildZip(
  name: string,
  files: UEMaps,
  manifest: unknown,
  baseColorExt: "png" | "jpg" = "png",
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(`T_${name}_BC.${baseColorExt}`, files.baseColor);
  zip.file(`T_${name}_N.png`, files.normal);
  zip.file(`T_${name}_ORM.png`, files.orm);
  zip.file(`T_${name}_H.png`, files.height);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("ue_import.py", UE_IMPORT_SCRIPT);
  zip.file("IMPORT_RECIPE.md", importRecipe(name));
  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}
