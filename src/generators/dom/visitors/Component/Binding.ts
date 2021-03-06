import deindent from '../../../../utils/deindent';
import flattenReference from '../../../../utils/flattenReference';
import getSetter from '../shared/binding/getSetter';
import { DomGenerator } from '../../index';
import Block from '../../Block';
import { Node } from '../../../../interfaces';
import { State } from '../../interfaces';
import getObject from '../../../../utils/getObject';

export default function visitBinding(
	generator: DomGenerator,
	block: Block,
	state: State,
	node: Node,
	attribute,
	local
) {
	const { name } = getObject(attribute.value);
	const { snippet, contexts, dependencies } = block.contextualise(
		attribute.value
	);

	contexts.forEach(context => {
		if (!~local.allUsedContexts.indexOf(context))
			local.allUsedContexts.push(context);
	});

	const contextual = block.contexts.has(name);

	let obj;
	let prop;

	if (contextual) {
		obj = block.listNames.get(name);
		prop = block.indexNames.get(name);
	} else if (attribute.value.type === 'MemberExpression') {
		prop = `[✂${attribute.value.property.start}-${attribute.value.property
			.end}✂]`;
		if (!attribute.value.computed) prop = `'${prop}'`;
		obj = `[✂${attribute.value.object.start}-${attribute.value.object.end}✂]`;
	} else {
		obj = 'state';
		prop = `'${name}'`;
	}

	local.bindings.push({
		name: attribute.name,
		value: snippet,
		obj,
		prop,
	});

	const setter = getSetter({
		block,
		name,
		snippet,
		_this: 'this',
		props: '_context',
		attribute,
		dependencies,
		value: 'value',
	});

	generator.hasComplexBindings = true;

	const updating = block.getUniqueName(`${local.name}_updating`);
	block.addVariable(updating, 'false');

	const observer = block.getUniqueName('observer');
	const value = block.getUniqueName('value');

	local.create.addBlock(deindent`
		function ${observer} ( value ) {
			if ( ${updating} ) return;
			${updating} = true;
			${setter}
			${updating} = false;
		}

		${local.name}.observe( '${attribute.name}', ${observer}, { init: false });

		#component._root._beforecreate.push( function () {
			var value = ${local.name}.get( '${attribute.name}' );
			if ( @differs( value, ${snippet} ) ) {
				${observer}.call( ${local.name}, value );
			}
		});
	`);

	local.update.addBlock(deindent`
		if ( !${updating} && ${dependencies
		.map(dependency => `'${dependency}' in changed`)
		.join(' || ')} ) {
			${updating} = true;
			${local.name}._set({ ${attribute.name}: ${snippet} });
			${updating} = false;
		}
	`);
}
