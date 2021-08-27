const server = require('http').createServer();
const { pool } = require('./db');
const { findWinner } = require('./helper');
const io = require('socket.io')(server, {
    cors: {
        origin: ['http://localhost:3000']
    }
});
const rooms = [];
io.on('connection', socket => {
    socket.on('join-group', async ({ uId, gId }, cb) => {
        //check xem room đã tồn tại chưa
        const query = 'select * from users where id = $1 limit 1';
        await pool.connect();
        const userResult = await pool.query(query, [uId]);
        let cRoom = rooms.find(room => room.id === gId);
        if (!userResult.rowCount) {
            return socket.emit('join-room-false', { message: 'user not exist' });
        }

        if (cRoom) {
            //nếu user đã trong room đó rồi thì không push vào nữa - tránh ngừoi dùng đăng nhập cùng tài khoản ở 2 client
            const isUserExist = cRoom.users.some(u => u.id === uId);

            if (!isUserExist) cRoom.users.push(userResult.rows[0]);
        } else {
            //lấy thời gian để đếm 
            const query = 'select * from sgroup where id = $1 limit 1';
            const groupResult = await pool.query(query, [gId]);
            if (!groupResult.rowCount) {
                return socket.emit('join-room-false', { message: 'group not exist' });
            }
            if (groupResult.rows[0].win) {
                return socket.emit('join-room-false', { message: 'vote is one', isDone: true })
            }
            const { createdTime, timeOut } = groupResult.rows[0];
            // đếm ngược để vote
            let couter = timeOut / 1000;
            let countDown = setInterval(() => {
                io.sockets.to(gId).emit('count-down', couter);
                couter--;
                if (couter <= -1) {
                    const query = 'update sgroup set win = $1 where id = $2';
                    const _room = rooms.find(item => item.id === gId);
                    if(_room){
                        //công bố địa điểm chiến thắng sau đó 
                        const winner = findWinner(_room.votes)
                        io.sockets.to(gId).emit('count-down-end',  winner)
            
                        //insert địa điểm chiến thắng vào db
                        pool.query(query, [JSON.stringify(winner), gId]).then(result => {
                            console.log('result : ' ,result)
                        }).catch(err => console.log('err : ', err));
                    }
                    clearInterval(countDown);
                }
            }, 1000)


            const newRoom = { id: gId, users: [userResult.rows[0]], votes: [] };
            cRoom = newRoom;
            rooms.push(newRoom);
        }
        socket.broadcast.to(gId).emit('user-joined-room', { user: userResult.rows[0] })
        cb({ room: cRoom });
        socket.join(gId);
    });

    //vote

    socket.on('vote', ({ location, uId, gId }) => {
        let cRoom = rooms.find(item => item.id === gId);
        if (cRoom) {
            const isRevote = cRoom.votes.some(i => i.uId === uId);
            if(isRevote) cRoom.votes = cRoom.votes.map(i => i.uId === uId ? { uId, locationId: location } : i);
            else cRoom.votes.push({ uId, locationId: location.id });
            io.sockets.to(gId).emit('voted', { votes: cRoom.votes, uId });
            
        }
    })
});

server.listen(8000);