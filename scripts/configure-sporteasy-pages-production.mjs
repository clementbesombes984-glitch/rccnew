// Add ONLY SportEasy bindings after all isolated Production checks pass.
import {readFile,writeFile} from 'node:fs/promises';
const raw=await readFile('C:/Users/Clement/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8');
let token=raw.match(/^oauth_token\s*=\s*["']([^"']+)/m)?.[1];
const base='https://api.cloudflare.com/client/v4/accounts/4299612fac6e91fbee26ed07aa7baa3f/pages/projects/rccnew';
async function request(method='GET',body){const response=await fetch(base,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw Error(`http_${response.status}`);return (await response.json()).result;}
try{
 const project=await request(),before=project.deployment_configs.production;
 if(project.canonical_deployment.id!=='c15b74f5-b2ef-492a-816f-d1d36d5ed8b0')throw Error('production_changed');
 if(before.env_vars.RCC_PUSH_ENABLED?.value!=='false')throw Error('push_not_disabled');
 if(before.d1_databases.RCC_FACEBOOK_DB?.id!=='d9488355-321c-4298-aba4-f256de6e4b73')throw Error('facebook_binding_mismatch');
 await writeFile('dist/sporteasy-production-install/pages-before.json',JSON.stringify({deployment:project.canonical_deployment.id,kv:before.kv_namespaces,d1:before.d1_databases,envNames:Object.keys(before.env_vars),readFlag:before.env_vars.RCC_SPORTEASY_READ_ENABLED||null},null,2),{flag:'wx'});
 // API PATCH merges env_vars; null is the documented deletion operation.
 await request('PATCH',{deployment_configs:{production:{kv_namespaces:{...before.kv_namespaces,RCC_SPORTEASY_KV:{namespace_id:'2f273875520b4362af2f4323aec5ec5b'}},env_vars:{RCC_SPORTEASY_READ_ENABLED:{type:'plain_text',value:'true'}}}}});
 const after=(await request()).deployment_configs.production;
 if(Object.keys(before.env_vars).some(name=>!after.env_vars[name])||after.env_vars.RCC_PUSH_ENABLED.value!=='false'||JSON.stringify(before.d1_databases)!==JSON.stringify(after.d1_databases))throw Error('unrelated_configuration_changed');
 for(const [name,value]of Object.entries(before.kv_namespaces))if(JSON.stringify(value)!==JSON.stringify(after.kv_namespaces[name]))throw Error('existing_kv_changed');
 console.log(JSON.stringify({sportEasyProductionBinding:after.kv_namespaces.RCC_SPORTEASY_KV.namespace_id,readEnabled:after.env_vars.RCC_SPORTEASY_READ_ENABLED.value,existingEnvNamesPreserved:true,facebookPreserved:true,pushPreserved:true}));
}catch(error){console.error(JSON.stringify({status:'blocked',code:/^[a-z_0-9]+$/.test(error.message)?error.message:'configuration_error'}));process.exitCode=1;}finally{token=null;}
