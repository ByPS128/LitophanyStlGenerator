"""Blender 4.2+: blender --background --python render_blender.py -- scene.json.

Uses the verified STL in millimetres, scaled to metres. Optical coefficients
are an approximation until calibrated against a printed material sample.
"""
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def main():
    path = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
    data = json.loads(path.read_text(encoding='utf-8'))
    directory = path.parent
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 16
    scene.cycles.transmission_bounces = 12
    scene.cycles.volume_bounces = 8
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(directory / 'render.png')
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.wm.stl_import(filepath=str(directory / 'moon.stl'), forward_axis='Y', up_axis='Z')
    moon = bpy.context.object
    moon.name = 'Verified lithophane'
    center = Vector(data['center'])
    for vertex in moon.data.vertices:
        vertex.co = (vertex.co - center) * .001
    # Flat normals describe the exported geometry; no smoothing modifier changes it.
    material = bpy.data.materials.new('Calibratable translucent white polymer')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    surface = nodes.new('ShaderNodeBsdfPrincipled')
    surface.inputs['Base Color'].default_value = (.96, .96, .96, 1)
    surface.inputs['Roughness'].default_value = .6
    surface.inputs['IOR'].default_value = 1.45
    surface.inputs['Transmission Weight'].default_value = 1
    links.new(surface.outputs['BSDF'], output.inputs['Surface'])
    volume = nodes.new('ShaderNodeVolumePrincipled')
    volume.inputs['Density'].default_value = data['attenuation'] * 1000
    volume.inputs['Color'].default_value = (.85, .85, .85, 1)
    volume.inputs['Anisotropy'].default_value = .3
    links.new(volume.outputs['Volume'], output.inputs['Volume'])
    moon.data.materials.append(material)

    radius = data['radius'] * .001
    light = bpy.data.lights.new('Internal LED', 'POINT')
    light.energy = data['brightness'] * 3
    light.shadow_soft_size = radius * .035
    light.use_nodes = True
    blackbody = light.node_tree.nodes.new('ShaderNodeBlackbody')
    blackbody.inputs['Temperature'].default_value = data['kelvin']
    emission = next(node for node in light.node_tree.nodes if node.type == 'EMISSION')
    light.node_tree.links.new(blackbody.outputs['Color'], emission.inputs['Color'])
    obj = bpy.data.objects.new('Internal LED', light)
    scene.collection.objects.link(obj)
    obj.location = Vector(data['light']) * .001

    world = bpy.data.worlds.new('Dark studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.08, .10, .15, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .12
    scene.world = world
    bottom = min(v.co.z for v in moon.data.vertices)
    bpy.ops.mesh.primitive_plane_add(size=radius * 30, location=(0, 0, bottom - .001))
    floor = bpy.context.object
    floor.name = 'Studio floor'
    floor_material = bpy.data.materials.new('Charcoal')
    floor_material.diffuse_color = (.025, .032, .045, 1)
    floor.data.materials.append(floor_material)

    camera = bpy.data.cameras.new('Camera')
    camera.lens = 48
    camera.clip_start = .001
    camera_object = bpy.data.objects.new('Camera', camera)
    scene.collection.objects.link(camera_object)
    camera_object.location = Vector(data['camera']) * .001
    camera_object.rotation_euler = (-camera_object.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera_object
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / 'scene.blend'))
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
