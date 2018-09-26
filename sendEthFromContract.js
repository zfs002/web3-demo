const Prompt = require('prompt-password');
const elliptic = require("elliptic");
const secp256k1 = new elliptic.ec("secp256k1");

function getAccountForAddress(address_json){
    var prompt = new Prompt({
        type: 'password',
        message: 'password for address:' + address_json.address,
        name: 'password',
        mask: require('prompt-password-strength')
    });
    return prompt.run()
        .then( password => {
            return web3.eth.accounts.decrypt(address_json, password);
        })
}
const web3 = require('./web3-instance');

function sign(hex, privateKey){
    var sig = secp256k1.keyFromPrivate(new Buffer(privateKey, 'hex')).sign(hex, {
        canonical: true
    });
    sig.v = sig.recoveryParam + 27; // old method befor eip 155 
    sig.r  =  web3.utils.leftPad('0x' + sig.r.toString(16), 64);
    sig.s  =  web3.utils.leftPad('0x' + sig.s.toString(16), 64);
    return sig;
}


var multiSigAbi = require('./SimpleMultiSig.json').abi;
var multiSigContractAddress = '0x90E9D32d4b41af3c67ea8a681ec285B7A8509b8C';
const contract = new web3.eth.Contract(multiSigAbi, multiSigContractAddress);


var targetOperation = {
    to: '0x', //to_address.address,
    value: web3.utils.toWei('0.001'),
    data: '0x'
}

function randomAddress()
{
    var addresses = [require('./from_address.json'), require('./to_address.json'), require('./address_3.json') ]
    addresses.sort( (a,b) => {
        return a.address < b.address ? -1: a.address > b.address ? 1: 0;
    })
    var toBeSkiped = Math.floor(Math.random() * 3 );
    if (toBeSkiped == 3){
        toBeSigned = 2;
    }
    var other= addresses.splice(toBeSkiped, 1);
    targetOperation.to = other[0].address;
    return addresses;
}

var toBeSigned;
var twoAddresses = randomAddress();




var sig1, sig2;
contract.methods.nonce().call().then( nonce => {
    toBeSigned = web3.utils.soliditySha3(
        0x19,
        0x00,
        multiSigContractAddress,
        targetOperation.to,
        targetOperation.value,
        nonce
         );
    return getAccountForAddress(twoAddresses[0]);
})
.then((acc0) => {
    sig1 = sign(toBeSigned, acc0.privateKey );
    return getAccountForAddress(twoAddresses[1]);
})
.then((acc1) => {
    sig2 = sign(toBeSigned, acc1.privateKey );
    var v_a = [sig1.v, sig2.v];
    var r_a = [sig1.r, sig2.r];
    var s_a = [sig1.s, sig2.s];
    console.log(v_a, r_a, s_a);
    var method = contract.methods.execute(v_a, r_a, s_a, targetOperation.to, targetOperation.value, targetOperation.data);
    return contractExecute(web3, acc1, contract, method );
})
.then((r)=>{
    console.log(r);
    process.exit(0);
})
.catch( (e)=>{
    console.error(e);
    process.exit(1);
})




function contractExecute(web3, account, contract, method) {


    var rawTx = {
        to: contract.options.address,
        from: account.address,
        nonce: '0x00',
        value: '0x',
        gasPrice: '0x5',
        gasLimit: '21000', // 
        data: method.encodeABI()
    }

    return Promise.all([
        web3.eth.getGasPrice(),
        web3.eth.getTransactionCount(rawTx.from),
        // method.estimateGas()
    ]).then((results) => {
        var price = results[0];
        var count = results[1];
        // var tx = new Tx(rawTx);
        rawTx.gasLimit = 3000000; // results[2] * 2;
        rawTx.gasPrice = price;
        rawTx.nonce = count;
        console.log('gasPrice', price);
        console.log('gasLimit', rawTx.gasLimit);
        return account.signTransaction(rawTx)



    }).then((tx) => {
        console.log(tx);
        return web3.eth.sendSignedTransaction(tx.rawTransaction)
    })
}