import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getLanNetworks} from './lan-network.js';
const ipv4=address=>({family:'IPv4',address,internal:false});
test('Wi-Fi first; exclude virtual, IPv6, loopback and disconnected adapters',()=>{
    const result=getLanNetworks({'vEthernet (WSL)': [ipv4('172.26.176.1')],Docker:[ipv4('172.17.0.1')],Ethernet:[ipv4('192.168.1.20')],'Wi-Fi':[ipv4('172.20.10.2'),{family:'IPv6',address:'::1',internal:false}],Loopback:[{...ipv4('127.0.0.1'),internal:true}],Other:[ipv4('169.254.10.2')]});
    assert.deepEqual(result.map(n=>n.address),['172.20.10.2','192.168.1.20']);
});
test('empty and unknown interfaces are handled',()=>{
    assert.deepEqual(getLanNetworks({}),[]);
    assert.equal(getLanNetworks({custom:[ipv4('10.1.1.2')]})[0].rank,2);
});
