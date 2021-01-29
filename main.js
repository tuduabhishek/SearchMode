const electron=require('electron');
const url=require('url');
const path=require('path');
const { createWorker } = require('tesseract.js');
const elasticlunr = require('elasticlunr');
const {app,BrowserWindow,Menu,ipcMain}=electron;
const Datastore = require('nedb');
var userData = app.getPath('userData');
var db;
let mainWindow,addWindow,cropWindow,processingWindow,viewImageWindow,initWindow,databaseWindow;
var imagesFiles=[];
var folderList=new Set();
var cProg=0,cScanned=0;
var contents;



var index = elasticlunr(function () {
    this.addField('title');
    this.addField('path');
    this.addField('body');
    this.setRef('id');
    this.saveDocument(true);
});

//Menu Template
const mainMenuTemplate=[
    {
        label:'File',
        submenu:[
            {
                label: 'Add Screenshots',
                click(){
                    createAddScreenshotsWindow();
                }
            },
            {
                label: 'Database',
                click(){
                    createDatabaseViewWindow();
                }
            },
            {
                label: 'Quit',
                click(){
                    app.quit();
                }
            }
        ]
    }
];
//Initialize
async function init(){
    
    db= await new Datastore({ filename: userData+'/DB/data.db', autoload: true })

    await db.find({}).exec(function(err,docs){
        docs.forEach(function(doc){
            let date=new Date();
            let d={
                "id":date.getTime(),
                "title":doc.title,
                "path":doc.path,
                "body":doc.body.replace(/[\x00-\x08\x0E-\x1F\x7F-\uFFFF]/g, '')
            };
            let uri=decodeURI(doc.path);
            uri=uri.substr(0,uri.lastIndexOf("\\"));
            folderList.add(encodeURI(uri));
           index.addDoc(d);
           cScanned++;
        });
    });
    setTimeout(function(){createMainWindow();}, 3000);

}

//When App is ready
app.on('ready',function(){

    //Create New Window
    initWindow=new BrowserWindow({
        width:640,
        height:360,
        title:'Initialize',
        frame:false,
        resizable:false,
        webPreferences:{
            nodeIntegration:true
        }
    });
    initWindow.loadURL(url.format({
        pathname:path.join(__dirname,'initWindow.html'),
        protocol:'file',
        slashes:true
        
    }));


    initWindow.on('ready-to-show',function(){
        init();    
    });



});

function createMainWindow(){

    //Create New Window
    mainWindow=new BrowserWindow({
        webPreferences:{
            nodeIntegration:true
        }
    });
    contents = mainWindow.webContents;
    mainWindow.maximize();
    mainWindow.loadURL(url.format({
        pathname:path.join(__dirname,'mainWindow.html'),
        protocol:'file',
        slashes:true
        
    }));

    //App Closed Handling
    mainWindow.on('closed',function(){
        app.quit();
    });

    mainWindow.on('ready-to-show',function(){
        initWindow.close();
        mainWindow.webContents.send("docCount",cScanned);
    });

    //Building Menu
    const mainMenu=Menu.buildFromTemplate(mainMenuTemplate);
    Menu.setApplicationMenu(mainMenu);
}


//Handle Adding Screenshots
function createAddScreenshotsWindow(){

    if(addWindow==null){
        addWindow=new BrowserWindow({
            width:640,
            height:360,
            title:'Add Screenshots',
            resizable:false,
            webPreferences:{
                nodeIntegration:true
            }
        });
        addWindow.loadURL(url.format({
            pathname:path.join(__dirname,'addWindow.html'),
            protocol:'file',
            slashes:true
        }));
    
        addWindow.on('closed',function(){
            addWindow=null;
        });
    
        addWindow.setMenu(null);
    }
    else{
        addWindow.focus();
    }
    

}

//Handling Croping
function createCropWindow(imagePath){
    cropWindow=new BrowserWindow({
        width:854,
        height:480,
        title:'Crop Screenshot',
        resizable:false,
        webPreferences:{
            nodeIntegration:true
        }
    });

    cropWindow.loadURL(url.format({
        pathname:path.join(__dirname,'cropWindow.html'),
        protocol:'file',
        slashes:true
    }));

    cropWindow.on('closed',function(){
        cropWindow=null;
    });

    cropWindow.on('ready-to-show',function(){
        cropWindow.webContents.send('imagePath',imagePath);
    });

    cropWindow.setMenu(null);
    

}

//Handle Processing
function createProcessingWindow(){
    processingWindow=new BrowserWindow({
        width:640,
        height:360,
        title:'Processing',
        resizable:false,
        webPreferences:{
            nodeIntegration:true
        }
    });

    processingWindow.loadURL(url.format({
        pathname:path.join(__dirname,'processingWindow.html'),
        protocol:'file',
        slashes:true
    }));

    processingWindow.on('closed',function(){
        processingWindow=null;       
    });

    processingWindow.on('ready-to-show',function(){
        processingWindow.webContents.send("ui:total",{total:imagesFiles.length,completed:0});
        processingWindow.webContents.send("ui:curr",imagesFiles[0].name);
    });

    processingWindow.setMenu(null);
}

function createViewImageWindow(uri){
    if(viewImageWindow==null){
        viewImageWindow=new BrowserWindow({
            width:854,
            height:480,
            title:'Screenshot View',
            webPreferences:{
                nodeIntegration:true
            }
        });
        viewImageWindow.loadURL(url.format({
            pathname:path.join(__dirname,'viewImageWindow.html'),
            protocol:'file',
            slashes:true
        }));
    
        viewImageWindow.on('closed',function(){
            viewImageWindow=null;
        });

        viewImageWindow.on('ready-to-show',function(){
            viewImageWindow.webContents.send("setImage",uri);
        });
        viewImageWindow.setMenu(null);
    }
    else{
        viewImageWindow.webContents.send("setImage",uri);
        viewImageWindow.focus();
    }

    
    
}

function createDatabaseViewWindow(){
    if(databaseWindow==null){
        databaseWindow=new BrowserWindow({
            width:854,
            height:480,
            title:'Database',
            webPreferences:{
                nodeIntegration:true
            }
        });
        databaseWindow.loadURL(url.format({
            pathname:path.join(__dirname,'databaseWindow.html'),
            protocol:'file',
            slashes:true
        }));
    
        databaseWindow.on('closed',function(){
            databaseWindow=null;
        });

        databaseWindow.on('ready-to-show',function(){
            databaseWindow.webContents.send("folderList",folderList);
        });
        databaseWindow.setMenu(null);
    }
    else{
        databaseWindow.focus();
    }

}

//Catch images:add
ipcMain.on('images:add',function(e,images){
    createCropWindow(images[0].path);
    imagesFiles=images;
    addWindow.close();  
});


//Catch images:startOCR
ipcMain.on('images:startOCR',function(e,rectangle){
    createProcessingWindow();
    cropWindow.close();
    startProcessing(rectangle);
});

//Catch query
ipcMain.on('query',function(e,query){
    let results=[];
    let res=index.search(query,{fields:{body:{boost:1}}});

    for(let i=0;i<res.length;i++) results.push(index.documentStore.getDoc(res[i].ref));
    mainWindow.webContents.send("results",results);
});

//Catch View
ipcMain.on('view',function(e,uri){
    createViewImageWindow(uri);
});

// Catch delFolder
ipcMain.on('delFolder',function(e,path){
    let reg=new RegExp("^("+path+")");
    db.find({path:{$regex:reg}}).sort({name: 1}).exec(function(err, docs) {
        docs.forEach(function(d) {
            let temp={
                "id":d.id,
                "title":d.title,
                "path":d.path,
                "body":d.body
            }
            index.removeDoc(temp);
        });
    });    

    db.remove({path:{$regex:reg}},{ multi: true } , function(err, numDeleted) {
        cScanned=cScanned-numDeleted;
        mainWindow.webContents.send("docCount",cScanned);
        folderList.delete(path);
   });
});

//Catch delAll
ipcMain.on('delAll',function(e,val){
    db.remove({},{ multi: true } , function(err, numDeleted) {
        mainWindow.webContents.send("docCount",0);
        folderList.clear();
   });
});

async function startProcessing(rectangle){

    const worker = createWorker({
        cachePath: path.join(__dirname, 'lang-data'),
      logger: m => updateCurrProg(m)
    });
    
    for(let i=0;i<imagesFiles.length;i++){
        processingWindow.webContents.send("ui:total",{total:imagesFiles.length,completed:i});
        processingWindow.webContents.send("ui:curr",imagesFiles[i].name);
        

          await (async () => {
            await worker.load();
            await worker.loadLanguage('eng');
            await worker.initialize('eng');
            const { data: { text } } = await worker.recognize(decodeURI(imagesFiles[i].path), { rectangle });
            let date=new Date();
            let doc={
                "id":date.getTime(),
                "title":imagesFiles[i].name,
                "path":imagesFiles[i].path,
                "body":text.replace(/[\x00-\x08\x0E-\x1F\x7F-\uFFFF]/g, ' ')
            };
            let uri=decodeURI(doc.path);
            uri=uri.substr(0,uri.lastIndexOf("\\"));
            folderList.add(encodeURI(uri));
            index.addDoc(doc);
            cScanned++;
            db.insert(doc, function(err, doc) {
            });
            await worker.terminate();
          })();
        
    }

    mainWindow.webContents.send("docCount",cScanned);
    processingWindow.close();
}


function updateCurrProg(data){
    try{
        
        if(data.status.localeCompare("recognizing text")!=0) return;
        let temp=Math.round(data.progress*100);
        if(temp==0) cProg=0;
        if(temp-cProg>5){
            cProg=temp;
            processingWindow.webContents.send("progressBar:curr",cProg+"%");
        }   
    }
    catch(e){
        process.exit();
    }
}






