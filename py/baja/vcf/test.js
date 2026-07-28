function () {
    exec('py/baja/vcf/hello-world.py', 'hello', 'world').then ( r => {
        showWidget ( {
            wid:'json',
            data:JSON.stringify ( r )
        })
    })

}
